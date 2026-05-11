// tools/shellhelp.cpp
//
// Native Win32 helper for SimpleExplorer's right-click actions. Replaces
// PowerShell shell-outs in src/fs.js, eliminating the ~200 ms PowerShell
// cold-start tax that dominates Properties / Delete / drive-list latency,
// and exposes the full Windows shell context menu (every installed shell
// extension — Open with VS Code, Git Bash, 7-Zip, TortoiseSVN, Send to,
// …) via IContextMenu so it matches stock Explorer 1:1.
//
// Build (one-time, MSVC):
//   cl /nologo /EHsc /O2 /utf-8 shellhelp.cpp ^
//     /link shell32.lib ole32.lib user32.lib gdi32.lib windowscodecs.lib
//
// Verbs:
//   shellhelp properties <path>             — show real Windows Properties
//   shellhelp trash <path> [<path> ...]     — send to Recycle Bin (batched)
//   shellhelp drives                        — emit drive-list JSON to stdout
//   shellhelp menu <path> [<path> ...]      — emit context-menu JSON tree
//   shellhelp invoke <id> <path> [<path>...] — invoke menu command id
//   shellhelp thumb <size> <path>           — write PNG thumb to %TEMP%; print path
//   shellhelp dragout <path> [<path> ...]   — start CF_HDROP DoDragDrop; print effect
//   shellhelp pty <shell> [<cwd>]           — spawn shell under ConPTY, pump bytes

// winsock2 must precede windows.h so the older winsock.h doesn't get
// pulled in by windows.h and collide with WSA types.
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <objbase.h>
#include <wincodec.h>
#include <oleidl.h>
#include <process.h>
#include <stdio.h>
#include <wchar.h>
#include <string.h>
#include <stdlib.h>

#pragma comment(lib, "ws2_32.lib")

// ID range for QueryContextMenu. 1-based — id 0 means "no command".
#define CTX_ID_MIN  1
#define CTX_ID_MAX  0x7FFF

static int verb_properties(int argc, wchar_t** argv) {
    if (argc < 3) {
        fwprintf(stderr, L"shellhelp: properties needs <path>\n");
        return 2;
    }
    SHELLEXECUTEINFOW sei = { sizeof(sei) };
    sei.fMask = SEE_MASK_INVOKEIDLIST;
    sei.lpVerb = L"properties";
    sei.lpFile = argv[2];
    sei.nShow = SW_SHOW;
    if (!ShellExecuteExW(&sei)) {
        fwprintf(stderr, L"shellhelp: properties failed (%lu)\n", GetLastError());
        return 1;
    }
    return 0;
}

static int verb_trash(int argc, wchar_t** argv) {
    if (argc < 3) {
        fwprintf(stderr, L"shellhelp: trash needs <path> [<path> ...]\n");
        return 2;
    }
    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    if (FAILED(hr)) return (int)hr;

    IFileOperation* op = NULL;
    hr = CoCreateInstance(CLSID_FileOperation, NULL, CLSCTX_ALL, IID_PPV_ARGS(&op));
    if (FAILED(hr)) {
        CoUninitialize();
        return (int)hr;
    }
    op->SetOperationFlags(FOF_ALLOWUNDO | FOF_NOCONFIRMATION |
                          FOF_NOERRORUI | FOF_SILENT | FOFX_RECYCLEONDELETE);

    int failed = 0;
    for (int i = 2; i < argc; ++i) {
        IShellItem* item = NULL;
        if (FAILED(SHCreateItemFromParsingName(argv[i], NULL, IID_PPV_ARGS(&item)))) {
            ++failed;
            continue;
        }
        if (FAILED(op->DeleteItem(item, NULL))) ++failed;
        item->Release();
    }

    hr = op->PerformOperations();
    op->Release();
    CoUninitialize();
    if (FAILED(hr)) return (int)hr;
    return failed ? 1 : 0;
}

static int verb_drives(void) {
    wchar_t buf[1024] = { 0 };
    DWORD len = GetLogicalDriveStringsW(_countof(buf), buf);
    if (!len) return 1;

    fputs("[", stdout);
    int first = 1;
    for (wchar_t* p = buf; *p; p += wcslen(p) + 1) {
        UINT t = GetDriveTypeW(p);
        if (t != DRIVE_FIXED && t != DRIVE_REMOVABLE &&
            t != DRIVE_REMOTE && t != DRIVE_CDROM) continue;

        ULARGE_INTEGER freeBytes = { 0 }, totalBytes = { 0 };
        GetDiskFreeSpaceExW(p, NULL, &totalBytes, &freeBytes);

        if (!first) fputs(",", stdout);
        first = 0;
        // p is e.g. "C:\\"; first char is the drive letter.
        printf("{\"letter\":\"%c\",\"free\":%llu,\"total\":%llu}",
               (char)p[0],
               (unsigned long long)freeBytes.QuadPart,
               (unsigned long long)totalBytes.QuadPart);
    }
    fputs("]\n", stdout);
    return 0;
}

// ── Context-menu helpers ────────────────────────────────────────────────────

// Print a UTF-8, JSON-escaped string. Input is UTF-16; we transcode to UTF-8
// via WideCharToMultiByte and escape the JSON-special chars on the way out.
static void json_print_str(const wchar_t* w) {
    if (!w) { fputs("\"\"", stdout); return; }
    int n = WideCharToMultiByte(CP_UTF8, 0, w, -1, NULL, 0, NULL, NULL);
    if (n <= 1) { fputs("\"\"", stdout); return; }
    char* u = (char*)malloc((size_t)n);
    if (!u) { fputs("\"\"", stdout); return; }
    WideCharToMultiByte(CP_UTF8, 0, w, -1, u, n, NULL, NULL);

    fputc('"', stdout);
    for (char* p = u; *p; ++p) {
        unsigned char c = (unsigned char)*p;
        switch (c) {
            case '"':  fputs("\\\"", stdout); break;
            case '\\': fputs("\\\\", stdout); break;
            case '\b': fputs("\\b",  stdout); break;
            case '\f': fputs("\\f",  stdout); break;
            case '\n': fputs("\\n",  stdout); break;
            case '\r': fputs("\\r",  stdout); break;
            case '\t': fputs("\\t",  stdout); break;
            default:
                if (c < 0x20) printf("\\u%04x", c);
                else fputc((int)c, stdout);
        }
    }
    fputc('"', stdout);
    free(u);
}

// Build an IContextMenu over <n> sibling paths (must share one parent
// folder, which is how Explorer's multi-select works). Hands back the
// parent IShellFolder so callers can release it after the menu is done.
static HRESULT build_context_menu(int n, wchar_t** paths,
                                  IContextMenu** out_cm,
                                  IShellFolder** out_parent) {
    *out_cm = NULL;
    *out_parent = NULL;
    if (n <= 0) return E_INVALIDARG;

    // First path defines the parent folder.
    PIDLIST_ABSOLUTE pidl0 = NULL;
    HRESULT hr = SHParseDisplayName(paths[0], NULL, &pidl0, 0, NULL);
    if (FAILED(hr)) return hr;

    IShellFolder* parent = NULL;
    PCUITEMID_CHILD child0 = NULL;
    hr = SHBindToParent(pidl0, IID_PPV_ARGS(&parent), &child0);
    if (FAILED(hr)) { CoTaskMemFree(pidl0); return hr; }

    // Callers (selections in one pane) always share a parent folder, so
    // we don't validate it — just gather the child PIDLs.
    PCUITEMID_CHILD* children = (PCUITEMID_CHILD*)malloc(sizeof(PCUITEMID_CHILD) * (size_t)n);
    PIDLIST_ABSOLUTE* abs = (PIDLIST_ABSOLUTE*)malloc(sizeof(PIDLIST_ABSOLUTE) * (size_t)n);
    if (!children || !abs) {
        free(children); free(abs);
        parent->Release(); CoTaskMemFree(pidl0);
        return E_OUTOFMEMORY;
    }
    abs[0] = pidl0;
    children[0] = child0;
    UINT count = 1;
    for (int i = 1; i < n; ++i) {
        PIDLIST_ABSOLUTE pidlI = NULL;
        if (FAILED(SHParseDisplayName(paths[i], NULL, &pidlI, 0, NULL))) continue;
        IShellFolder* parentI = NULL;
        PCUITEMID_CHILD childI = NULL;
        if (FAILED(SHBindToParent(pidlI, IID_PPV_ARGS(&parentI), &childI))) {
            CoTaskMemFree(pidlI);
            continue;
        }
        parentI->Release();
        abs[count] = pidlI;
        children[count] = childI;
        count++;
    }

    IContextMenu* cm = NULL;
    hr = parent->GetUIObjectOf(NULL, count, (PCUITEMID_CHILD_ARRAY)children,
                               IID_IContextMenu, NULL, (void**)&cm);

    // PIDLs were absolute; SHBindToParent's child pointers are interior to
    // the absolute PIDL, so freeing each absolute PIDL also frees the child.
    for (UINT i = 0; i < count; ++i) CoTaskMemFree(abs[i]);
    free(children);
    free(abs);

    if (FAILED(hr)) { parent->Release(); return hr; }
    *out_cm = cm;
    *out_parent = parent;
    return S_OK;
}

// Recursively walk an HMENU populated by QueryContextMenu and emit JSON.
// Calls IContextMenu3::HandleMenuMsg2(WM_INITMENUPOPUP) before recursing
// into each submenu — without this, lazy submenus (Send to, 7-Zip,
// TortoiseSVN, …) come back empty.
static void emit_menu(IContextMenu* cm, HMENU hm) {
    IContextMenu3* cm3 = NULL;
    cm->QueryInterface(IID_PPV_ARGS(&cm3)); // optional; may be NULL

    int n = GetMenuItemCount(hm);
    fputs("[", stdout);
    int first = 1;
    for (int i = 0; i < n; ++i) {
        MENUITEMINFOW mii = { sizeof(mii) };
        mii.fMask = MIIM_FTYPE | MIIM_ID | MIIM_SUBMENU | MIIM_STRING | MIIM_STATE;
        mii.dwTypeData = NULL;
        if (!GetMenuItemInfoW(hm, (UINT)i, TRUE, &mii)) continue;

        if (!first) fputs(",", stdout);
        first = 0;

        if (mii.fType & MFT_SEPARATOR) {
            fputs("{\"separator\":true}", stdout);
            continue;
        }

        // Re-query with a buffer for the label.
        wchar_t label[512] = { 0 };
        mii.cch = _countof(label);
        mii.dwTypeData = label;
        mii.fMask = MIIM_FTYPE | MIIM_ID | MIIM_SUBMENU | MIIM_STRING | MIIM_STATE;
        GetMenuItemInfoW(hm, (UINT)i, TRUE, &mii);

        bool disabled = (mii.fState & (MFS_DISABLED | MFS_GRAYED)) != 0;

        fputs("{", stdout);
        fputs("\"label\":", stdout);
        json_print_str(label);

        if (mii.hSubMenu) {
            // Populate lazy submenus before recursing.
            if (cm3) {
                LRESULT lr = 0;
                cm3->HandleMenuMsg2(WM_INITMENUPOPUP,
                                    (WPARAM)mii.hSubMenu,
                                    (LPARAM)i, &lr);
            }
            fputs(",\"submenu\":", stdout);
            emit_menu(cm, mii.hSubMenu);
        } else {
            // Leaf entry — emit id + canonical verb if available.
            UINT idx = mii.wID >= CTX_ID_MIN ? (mii.wID - CTX_ID_MIN) : 0;
            printf(",\"id\":%u", idx);
            wchar_t verb[128] = { 0 };
            HRESULT hv = cm->GetCommandString(idx, GCS_VERBW, NULL,
                                              (LPSTR)verb, _countof(verb));
            if (SUCCEEDED(hv) && verb[0]) {
                fputs(",\"verb\":", stdout);
                json_print_str(verb);
            }
        }
        if (disabled) fputs(",\"disabled\":true", stdout);
        fputs("}", stdout);
    }
    fputs("]", stdout);

    if (cm3) cm3->Release();
}

static int verb_menu(int argc, wchar_t** argv) {
    if (argc < 3) {
        fwprintf(stderr, L"shellhelp: menu needs <path> [<path> ...]\n");
        return 2;
    }
    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    if (FAILED(hr)) return (int)hr;

    IContextMenu* cm = NULL;
    IShellFolder* parent = NULL;
    hr = build_context_menu(argc - 2, argv + 2, &cm, &parent);
    if (FAILED(hr) || !cm) {
        CoUninitialize();
        fwprintf(stderr, L"shellhelp: menu build failed (0x%08lx)\n", (unsigned long)hr);
        return 1;
    }

    HMENU hm = CreatePopupMenu();
    hr = cm->QueryContextMenu(hm, 0, CTX_ID_MIN, CTX_ID_MAX,
                              CMF_NORMAL | CMF_EXTENDEDVERBS);
    if (FAILED(hr)) {
        DestroyMenu(hm);
        cm->Release();
        parent->Release();
        CoUninitialize();
        return 1;
    }

    emit_menu(cm, hm);
    fputs("\n", stdout);

    DestroyMenu(hm);
    cm->Release();
    parent->Release();
    CoUninitialize();
    return 0;
}

static int verb_invoke(int argc, wchar_t** argv) {
    if (argc < 4) {
        fwprintf(stderr, L"shellhelp: invoke needs <id> <path> [<path> ...]\n");
        return 2;
    }
    UINT id = (UINT)_wtoi(argv[2]);
    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    if (FAILED(hr)) return (int)hr;

    IContextMenu* cm = NULL;
    IShellFolder* parent = NULL;
    hr = build_context_menu(argc - 3, argv + 3, &cm, &parent);
    if (FAILED(hr) || !cm) {
        CoUninitialize();
        return 1;
    }

    // Build the menu so any registered IDs are valid in the IContextMenu's
    // internal state, even though we don't consult the HMENU.
    HMENU hm = CreatePopupMenu();
    cm->QueryContextMenu(hm, 0, CTX_ID_MIN, CTX_ID_MAX,
                         CMF_NORMAL | CMF_EXTENDEDVERBS);

    CMINVOKECOMMANDINFOEX ici = { sizeof(ici) };
    ici.fMask = CMIC_MASK_UNICODE;
    ici.hwnd = NULL;
    ici.lpVerb  = MAKEINTRESOURCEA(id);
    ici.lpVerbW = MAKEINTRESOURCEW(id);
    ici.nShow = SW_SHOWNORMAL;
    hr = cm->InvokeCommand((CMINVOKECOMMANDINFO*)&ici);

    DestroyMenu(hm);
    cm->Release();
    parent->Release();
    CoUninitialize();
    return SUCCEEDED(hr) ? 0 : 1;
}

// Save HBITMAP to a PNG file via WIC. Caller owns the bitmap. Returns
// HRESULT; on success, the file at `outPath` contains the encoded PNG.
static HRESULT save_hbitmap_png(HBITMAP hbm, const wchar_t* outPath) {
    IWICImagingFactory* factory = NULL;
    HRESULT hr = CoCreateInstance(CLSID_WICImagingFactory, NULL, CLSCTX_INPROC_SERVER,
                                  IID_PPV_ARGS(&factory));
    if (FAILED(hr)) return hr;

    IWICBitmap* bitmap = NULL;
    hr = factory->CreateBitmapFromHBITMAP(hbm, NULL, WICBitmapUseAlpha, &bitmap);
    if (SUCCEEDED(hr)) {
        IWICStream* stream = NULL;
        hr = factory->CreateStream(&stream);
        if (SUCCEEDED(hr)) {
            hr = stream->InitializeFromFilename(outPath, GENERIC_WRITE);
            if (SUCCEEDED(hr)) {
                IWICBitmapEncoder* enc = NULL;
                hr = factory->CreateEncoder(GUID_ContainerFormatPng, NULL, &enc);
                if (SUCCEEDED(hr)) {
                    hr = enc->Initialize(stream, WICBitmapEncoderNoCache);
                    if (SUCCEEDED(hr)) {
                        IWICBitmapFrameEncode* frame = NULL;
                        IPropertyBag2* props = NULL;
                        hr = enc->CreateNewFrame(&frame, &props);
                        if (SUCCEEDED(hr)) {
                            frame->Initialize(props);
                            UINT w = 0, h = 0;
                            bitmap->GetSize(&w, &h);
                            frame->SetSize(w, h);
                            WICPixelFormatGUID fmt = GUID_WICPixelFormat32bppBGRA;
                            frame->SetPixelFormat(&fmt);
                            frame->WriteSource(bitmap, NULL);
                            frame->Commit();
                            enc->Commit();
                            frame->Release();
                            if (props) props->Release();
                        }
                    }
                    enc->Release();
                }
            }
            stream->Release();
        }
        bitmap->Release();
    }
    factory->Release();
    return hr;
}

static int verb_thumb(int argc, wchar_t** argv) {
    if (argc < 4) {
        fwprintf(stderr, L"shellhelp: thumb needs <size> <path>\n");
        return 2;
    }
    int size = _wtoi(argv[2]);
    if (size <= 0 || size > 1024) size = 96;
    const wchar_t* path = argv[3];

    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    if (FAILED(hr)) return (int)hr;

    IShellItemImageFactory* factory = NULL;
    hr = SHCreateItemFromParsingName(path, NULL, IID_PPV_ARGS(&factory));
    if (FAILED(hr)) { CoUninitialize(); return (int)hr; }

    SIZE sz = { size, size };
    HBITMAP hbm = NULL;
    // SIIGBF_THUMBNAILONLY would refuse to fall back to an icon. We
    // accept fallback so the cache still has *something* for icons.
    hr = factory->GetImage(sz, SIIGBF_RESIZETOFIT | SIIGBF_BIGGERSIZEOK, &hbm);
    factory->Release();
    if (FAILED(hr) || !hbm) { CoUninitialize(); return (int)hr; }

    // Write to %TEMP%\sephthumb_<tick>.png; tick keeps the name unique
    // across rapid calls without bloating the cache helper-side.
    wchar_t tempDir[MAX_PATH];
    GetTempPathW(_countof(tempDir), tempDir);
    wchar_t outPath[MAX_PATH];
    swprintf_s(outPath, _countof(outPath), L"%ssephthumb_%llu.png",
               tempDir, (unsigned long long)GetTickCount64());

    hr = save_hbitmap_png(hbm, outPath);
    DeleteObject(hbm);
    CoUninitialize();
    if (FAILED(hr)) return (int)hr;

    // Print the path — JS reads it via filesystem.readBinaryFile.
    wprintf(L"%ls\n", outPath);
    return 0;
}

static int verb_dragout(int argc, wchar_t** argv) {
    if (argc < 3) {
        fwprintf(stderr, L"shellhelp: dragout needs <path> [<path> ...]\n");
        return 2;
    }
    HRESULT hr = OleInitialize(NULL);
    if (FAILED(hr)) return (int)hr;

    IShellItemArray* arr = NULL;
    PIDLIST_ABSOLUTE* pidls = (PIDLIST_ABSOLUTE*)CoTaskMemAlloc(sizeof(PIDLIST_ABSOLUTE) * (argc - 2));
    int count = 0;
    for (int i = 2; i < argc; ++i) {
        PIDLIST_ABSOLUTE pidl = NULL;
        if (SUCCEEDED(SHParseDisplayName(argv[i], NULL, &pidl, 0, NULL))) {
            pidls[count++] = pidl;
        }
    }
    if (!count) { CoTaskMemFree(pidls); OleUninitialize(); return 1; }

    hr = SHCreateShellItemArrayFromIDLists(count, (PCIDLIST_ABSOLUTE_ARRAY)pidls, &arr);
    for (int i = 0; i < count; ++i) ILFree(pidls[i]);
    CoTaskMemFree(pidls);
    if (FAILED(hr) || !arr) { OleUninitialize(); return (int)hr; }

    IDataObject* data = NULL;
    hr = arr->BindToHandler(NULL, BHID_DataObject, IID_PPV_ARGS(&data));
    arr->Release();
    if (FAILED(hr) || !data) { OleUninitialize(); return (int)hr; }

    DWORD effect = 0;
    hr = DoDragDrop(data, NULL, DROPEFFECT_COPY | DROPEFFECT_MOVE | DROPEFFECT_LINK, &effect);
    data->Release();
    OleUninitialize();
    // Print effect so JS can decide whether to refresh the source pane:
    //   1 = copy, 2 = move, 4 = link, 0 = none/cancelled.
    wprintf(L"%lu\n", effect);
    return SUCCEEDED(hr) ? 0 : 1;
}

// ── ConPTY pty verb ─────────────────────────────────────────────────────────
//
// Spawns the requested shell under a Windows ConPTY (Win10 1809+) and
// pumps bytes between the helper's own stdin/stdout and the PTY:
//
//   helper.stdin  ──▶  PTY input  ──▶  shell reads keystrokes
//   shell writes  ──▶  PTY output ──▶  helper.stdout
//
// JS (src/terminal.js) spawns this helper via Neutralino.os.spawnProcess;
// xterm.js's onData/write handlers wire its bytes to the helper's pipes.
//
// Resize: JS injects an out-of-band control sequence on stdin —
//   ESC ] SE_CTL ; resize ; <cols> ; <rows> BEL
// The helper's stdin pump scans for that prefix, intercepts the message,
// and calls ResizePseudoConsole. The OSC-style framing (ESC ]…BEL) is
// well-defined in xterm protocols and won't be produced by user
// keystrokes, so there's no realistic collision risk with PTY input.
//
// Return codes:
//   0    — child process exited normally; child's exit code is on stdout
//          as a literal final line "\nshellhelp.pty.exit=<code>\n"
//   3    — ConPTY APIs not present (Windows < 1809)
//   1    — generic failure (pipe / spawn / GetProcAddress mismatch)

#define PTY_CTL_PREFIX   "\x1b]SE_CTL;"
#define PTY_CTL_PREFIX_N 9
#define PTY_CTL_TERM     '\x07'

// Resolved at runtime so we can produce a clean error on Windows < 1809
// instead of failing to load the binary altogether.
typedef HRESULT (WINAPI *PFN_CreatePseudoConsole)(COORD, HANDLE, HANDLE, DWORD, HPCON*);
typedef HRESULT (WINAPI *PFN_ResizePseudoConsole)(HPCON, COORD);
typedef void    (WINAPI *PFN_ClosePseudoConsole)(HPCON);

struct PtyCtx {
    HANDLE inputWrite;   // we write to here; PTY reads from inputRead
    HANDLE outputRead;   // PTY writes to outputWrite; we read from here
    HPCON  hpc;
    PFN_ResizePseudoConsole pResize;
    volatile LONG running;
    // Loopback TCP listener the JS side hits with one HTTP POST per
    // keystroke / control message. Replaces the previous named-pipe
    // approach: Neutralino's filesystem.appendFile resolved success
    // without delivering bytes to `\\.\pipe\…` paths on Windows
    // (std::ofstream with mode "ab" opens the path via the CRT, which
    // doesn't recognize the pipe namespace and silently failed). The
    // root cause one layer up — os.updateSpawnedProcess('stdIn', …) is
    // broken because Neutralino wraps every spawn in `cmd.exe /c` —
    // is still the reason we can't use stdin. TCP sidesteps both.
    SOCKET listenSock;
    int    listenPort;
};

// Thread: read PTY output → write to our stdout. xterm.js renders bytes
// directly. Newlines / colors / cursor moves are all PTY-emitted ANSI.
static unsigned __stdcall pump_out(void* arg) {
    PtyCtx* c = (PtyCtx*)arg;
    HANDLE outOurs = GetStdHandle(STD_OUTPUT_HANDLE);
    char buf[4096];
    DWORD n = 0;
    while (InterlockedCompareExchange(&c->running, 0, 0)) {
        if (!ReadFile(c->outputRead, buf, sizeof(buf), &n, NULL) || n == 0) break;
        DWORD written = 0;
        const char* p = buf;
        DWORD remaining = n;
        while (remaining > 0) {
            if (!WriteFile(outOurs, p, remaining, &written, NULL) || written == 0) {
                return 0;
            }
            p += written;
            remaining -= written;
        }
    }
    return 0;
}

// Apply a parsed control payload like "resize;80;24". Unknown commands
// are silently ignored — additive protocol, future-friendly.
static void apply_control(PtyCtx* c, const char* payload, size_t n) {
    // Need writable copy for strtok-style scan.
    if (n == 0 || n > 256) return;
    char buf[260];
    memcpy(buf, payload, n);
    buf[n] = 0;

    if (strncmp(buf, "resize;", 7) == 0) {
        const char* p = buf + 7;
        int cols = atoi(p);
        const char* sc = strchr(p, ';');
        int rows = sc ? atoi(sc + 1) : 0;
        if (cols > 0 && rows > 0 && c->pResize && c->hpc) {
            COORD sz = { (SHORT)cols, (SHORT)rows };
            c->pResize(c->hpc, sz);
        }
    }
}

// Feed a chunk of bytes from a POST body through the OSC-framed control
// state machine, dispatching control messages and writing passthrough
// bytes to the PTY input pipe. State is owned by the caller so a
// control message that straddles two POSTs still reassembles.
//
// State machine:
//   0 — passthrough; on ESC, switch to 1 and stash it
//   1 — saw ESC; on ']', match prefix; otherwise flush ESC + this byte
//   2 — capturing payload until BEL; on BEL, dispatch and return to 0
//
// Returns false if writing to the PTY input pipe fails (shell dying).
static bool feed_pty_input(PtyCtx* c, const char* buf, int n,
                           int* state, size_t* prefixMatched,
                           char* payload, size_t* payloadLen) {
    char out[4096];
    size_t outLen = 0;

    auto flush = [&]() -> bool {
        if (outLen == 0) return true;
        DWORD written = 0;
        const char* p = out;
        size_t remaining = outLen;
        size_t total = outLen;
        while (remaining > 0) {
            if (!WriteFile(c->inputWrite, p, (DWORD)remaining, &written, NULL) ||
                written == 0) {
                fprintf(stderr, "[shellhelp] pty write FAIL at %zu/%zu (err=%lu)\n",
                        total - remaining, total, GetLastError());
                fflush(stderr);
                outLen = 0;
                return false;
            }
            p += written;
            remaining -= written;
        }
        // Probe: each successful PTY-input write. Pair with the
        // "tcp rx cl=N" line above to verify the byte made it from
        // socket → ConPTY input pipe. If this line fires per keystroke
        // and no shell echo follows, the failure is in ConPTY or cmd.exe
        // (not the helper).
        fprintf(stderr, "[shellhelp] pty write %zu\n", total);
        fflush(stderr);
        outLen = 0;
        return true;
    };

    for (int i = 0; i < n; ++i) {
        char b = buf[i];
        if (*state == 0) {
            if (b == '\x1b') { *state = 1; *prefixMatched = 1; }
            else { out[outLen++] = b; }
        } else if (*state == 1) {
            if (*prefixMatched < PTY_CTL_PREFIX_N &&
                b == PTY_CTL_PREFIX[*prefixMatched]) {
                (*prefixMatched)++;
                if (*prefixMatched == PTY_CTL_PREFIX_N) {
                    *state = 2;
                    *payloadLen = 0;
                }
            } else {
                for (size_t k = 0; k < *prefixMatched; ++k) {
                    out[outLen++] = PTY_CTL_PREFIX[k];
                }
                *state = 0;
                *prefixMatched = 0;
                --i;
            }
        } else {
            if (b == PTY_CTL_TERM) {
                apply_control(c, payload, *payloadLen);
                *state = 0; *prefixMatched = 0; *payloadLen = 0;
            } else if (*payloadLen < 511) {
                payload[(*payloadLen)++] = b;
            } else {
                *state = 0; *prefixMatched = 0; *payloadLen = 0;
            }
        }
        // Keep `out` from overflowing on large pastes. Headroom of
        // PTY_CTL_PREFIX_N covers the worst-case "flush stashed prefix"
        // path that can append several bytes in a single iteration.
        if (outLen >= sizeof(out) - PTY_CTL_PREFIX_N - 1) {
            if (!flush()) return false;
        }
    }
    return flush();
}

// Thread: accept() loop on a 127.0.0.1 TCP listener. Each accepted
// connection is one HTTP POST whose body is forwarded to the PTY (or
// parsed as a control message). Replaces the prior named-pipe pump —
// see the PtyCtx comment for the reason.
//
// Why HTTP and not raw bytes: the JS side has to use `fetch` because
// Neutralino doesn't expose raw sockets. Speaking HTTP back means a
// simple POST with `Content-Type: text/plain` (the browser default for
// a string `body`) skips CORS preflight, so we just need to honor
// Content-Length and respond 204.
static unsigned __stdcall pump_in(void* arg) {
    PtyCtx* c = (PtyCtx*)arg;

    int state = 0;
    size_t prefixMatched = 0;
    char payload[512];
    size_t payloadLen = 0;

    while (InterlockedCompareExchange(&c->running, 0, 0)) {
        sockaddr_in caddr;
        int caddrLen = sizeof(caddr);
        SOCKET cs = accept(c->listenSock, (sockaddr*)&caddr, &caddrLen);
        if (cs == INVALID_SOCKET) {
            // Listener closed (shutdown) or transient error.
            if (!InterlockedCompareExchange(&c->running, 0, 0)) break;
            Sleep(5);
            continue;
        }

        // Read headers until \r\n\r\n. 8 KiB is plenty for our own client
        // (browsers send ~300 B of headers for a simple POST).
        char hdr[8192];
        int hdrLen = 0;
        int bodyStart = -1;
        while (hdrLen < (int)sizeof(hdr) - 1) {
            int n = recv(cs, hdr + hdrLen, (int)sizeof(hdr) - 1 - hdrLen, 0);
            if (n <= 0) break;
            hdrLen += n;
            for (int i = 0; i + 3 < hdrLen; ++i) {
                if (hdr[i] == '\r' && hdr[i+1] == '\n' &&
                    hdr[i+2] == '\r' && hdr[i+3] == '\n') {
                    bodyStart = i + 4;
                    break;
                }
            }
            if (bodyStart >= 0) break;
        }
        if (bodyStart < 0) { closesocket(cs); continue; }

        // Parse Content-Length out of the header block. Null-terminate at
        // bodyStart so the case-insensitive scan can't run into body bytes.
        hdr[bodyStart] = 0;
        int contentLength = 0;
        for (int i = 0; i < bodyStart - 15; ++i) {
            if (_strnicmp(hdr + i, "content-length:", 15) == 0) {
                int j = i + 15;
                while (j < bodyStart && (hdr[j] == ' ' || hdr[j] == '\t')) j++;
                contentLength = atoi(hdr + j);
                break;
            }
        }
        // Sanity cap: refuse pathological lengths so a malformed header
        // can't make us read forever.
        if (contentLength < 0 || contentLength > (1 << 20)) contentLength = 0;

        // Body bytes already buffered with the headers.
        int inHdr = hdrLen - bodyStart;
        if (inHdr > contentLength) inHdr = contentLength;
        // Probe: confirm receipt over TCP. Goes to stderr → Neutralino's
        // stdErr action → JS handler logs the chunk and writes it into
        // xterm, so the helper self-reports without needing a rebuild to
        // read.
        fprintf(stderr, "[shellhelp] tcp rx cl=%d\n", contentLength);
        fflush(stderr);
        bool ok = true;
        if (inHdr > 0) {
            ok = feed_pty_input(c, hdr + bodyStart, inHdr,
                                &state, &prefixMatched, payload, &payloadLen);
        }

        // Drain the rest off the wire in chunks.
        char chunk[4096];
        int remaining = contentLength - inHdr;
        while (ok && remaining > 0 && InterlockedCompareExchange(&c->running, 0, 0)) {
            int want = remaining < (int)sizeof(chunk) ? remaining : (int)sizeof(chunk);
            int got = recv(cs, chunk, want, 0);
            if (got <= 0) break;
            ok = feed_pty_input(c, chunk, got,
                                &state, &prefixMatched, payload, &payloadLen);
            remaining -= got;
        }

        const char* resp =
            "HTTP/1.1 204 No Content\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Connection: close\r\n"
            "Content-Length: 0\r\n\r\n";
        send(cs, resp, (int)strlen(resp), 0);
        shutdown(cs, SD_SEND);
        closesocket(cs);

        if (!ok) {
            // PTY input pipe is gone — shell is dying. Stop accepting;
            // process tear-down will reap us.
            return 0;
        }
    }
    return 0;
}

static int verb_pty(int argc, wchar_t** argv) {
    if (argc < 3) {
        fwprintf(stderr, L"shellhelp: pty needs <shell> [<cwd>]\n");
        return 2;
    }
    const wchar_t* shell = argv[2];
    const wchar_t* cwd = (argc >= 4) ? argv[3] : NULL;

    // ConPTY symbols live in kernel32 since Win10 1809. Resolve at runtime
    // so this binary still loads on older Windows; JS falls back to v1.
    HMODULE hk32 = GetModuleHandleW(L"kernel32.dll");
    PFN_CreatePseudoConsole pCreate = (PFN_CreatePseudoConsole)
        GetProcAddress(hk32, "CreatePseudoConsole");
    PFN_ResizePseudoConsole pResize = (PFN_ResizePseudoConsole)
        GetProcAddress(hk32, "ResizePseudoConsole");
    PFN_ClosePseudoConsole pClose = (PFN_ClosePseudoConsole)
        GetProcAddress(hk32, "ClosePseudoConsole");
    if (!pCreate || !pResize || !pClose) {
        fwprintf(stderr, L"shellhelp: ConPTY unavailable (need Windows 10 1809+)\n");
        return 3;
    }

    // Two anonymous pipes:
    //   inputRead  ◀── inputWrite  (we write keystrokes; PTY reads them)
    //   outputRead ◀── outputWrite (PTY writes screen; we read it)
    HANDLE inputRead = NULL, inputWrite = NULL;
    HANDLE outputRead = NULL, outputWrite = NULL;
    SECURITY_ATTRIBUTES sa = { sizeof(sa), NULL, TRUE };
    if (!CreatePipe(&inputRead, &inputWrite, NULL, 0) ||
        !CreatePipe(&outputRead, &outputWrite, NULL, 0)) {
        fwprintf(stderr, L"shellhelp: CreatePipe failed (%lu)\n", GetLastError());
        return 1;
    }

    // Start at a sane default; JS will resize-message us almost
    // immediately with the real grid dimensions.
    COORD size = { 80, 24 };
    HPCON hpc = NULL;
    HRESULT hr = pCreate(size, inputRead, outputWrite, 0, &hpc);
    if (FAILED(hr)) {
        fwprintf(stderr, L"shellhelp: CreatePseudoConsole failed (0x%08lx)\n",
                 (unsigned long)hr);
        return 1;
    }
    // The PTY now owns the slave-side handles.
    CloseHandle(inputRead);
    CloseHandle(outputWrite);

    // Set up STARTUPINFOEX with the PTY attribute, then CreateProcess.
    SIZE_T attrSize = 0;
    InitializeProcThreadAttributeList(NULL, 1, 0, &attrSize);
    PPROC_THREAD_ATTRIBUTE_LIST attrList =
        (PPROC_THREAD_ATTRIBUTE_LIST)HeapAlloc(GetProcessHeap(), 0, attrSize);
    if (!attrList) {
        pClose(hpc);
        return 1;
    }
    if (!InitializeProcThreadAttributeList(attrList, 1, 0, &attrSize) ||
        !UpdateProcThreadAttribute(attrList, 0, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
                                   hpc, sizeof(hpc), NULL, NULL)) {
        HeapFree(GetProcessHeap(), 0, attrList);
        pClose(hpc);
        return 1;
    }

    STARTUPINFOEXW si = {};
    si.StartupInfo.cb = sizeof(si);
    si.lpAttributeList = attrList;

    // CreateProcessW needs a writable command-line buffer.
    wchar_t cmdline[1024];
    swprintf_s(cmdline, _countof(cmdline), L"%ls", shell);

    PROCESS_INFORMATION pi = {};
    BOOL ok = CreateProcessW(
        NULL, cmdline, NULL, NULL, FALSE,
        EXTENDED_STARTUPINFO_PRESENT,
        NULL, cwd, &si.StartupInfo, &pi);
    DeleteProcThreadAttributeList(attrList);
    HeapFree(GetProcessHeap(), 0, attrList);
    if (!ok) {
        fwprintf(stderr, L"shellhelp: CreateProcess(%ls) failed (%lu)\n",
                 shell, GetLastError());
        pClose(hpc);
        return 1;
    }

    PtyCtx ctx = {};
    ctx.inputWrite = inputWrite;
    ctx.outputRead = outputRead;
    ctx.hpc = hpc;
    ctx.pResize = pResize;
    ctx.listenSock = INVALID_SOCKET;
    InterlockedExchange(&ctx.running, 1);

    // Bring up a 127.0.0.1 TCP listener on an OS-assigned port, then
    // announce the port to JS via stdout before any PTY output can
    // interleave. src/terminal.js buffers stdOut, scans for this
    // sentinel, strips the line from xterm output, and POSTs each
    // keystroke / control message to http://127.0.0.1:<port>/.
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        fwprintf(stderr, L"shellhelp: WSAStartup failed (%d)\n", WSAGetLastError());
        pClose(hpc);
        return 1;
    }
    SOCKET ls = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (ls == INVALID_SOCKET) {
        fwprintf(stderr, L"shellhelp: socket failed (%d)\n", WSAGetLastError());
        WSACleanup();
        pClose(hpc);
        return 1;
    }
    sockaddr_in laddr = {};
    laddr.sin_family = AF_INET;
    laddr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    laddr.sin_port = 0;  // OS-assigned, harvested via getsockname below
    if (bind(ls, (sockaddr*)&laddr, sizeof(laddr)) == SOCKET_ERROR ||
        listen(ls, 8) == SOCKET_ERROR) {
        fwprintf(stderr, L"shellhelp: bind/listen failed (%d)\n", WSAGetLastError());
        closesocket(ls);
        WSACleanup();
        pClose(hpc);
        return 1;
    }
    int laddrLen = sizeof(laddr);
    getsockname(ls, (sockaddr*)&laddr, &laddrLen);
    ctx.listenSock = ls;
    ctx.listenPort = ntohs(laddr.sin_port);
    printf("shellhelp.pty.port=%d\n", ctx.listenPort);
    fflush(stdout);

    HANDLE thOut = (HANDLE)_beginthreadex(NULL, 0, pump_out, &ctx, 0, NULL);
    HANDLE thIn  = (HANDLE)_beginthreadex(NULL, 0, pump_in,  &ctx, 0, NULL);

    // Self-test injection: write a known command directly to inputWrite
    // ~500 ms after startup, bypassing the TCP path entirely. If we see
    // `__shellhelp_selftest__` echo + its "not recognized" output in
    // xterm, the helper→ConPTY→cmd.exe input chain works end-to-end and
    // the failure mode is somewhere on the JS-side keystroke path
    // (xterm onData → fetch → accept → feed_pty_input). If we DON'T
    // see it, the PTY input wiring itself is broken and JS-side fixes
    // cannot help.
    Sleep(500);
    const char* probe = "echo __shellhelp_selftest__\r";
    DWORD probeWritten = 0;
    BOOL probeOk = WriteFile(ctx.inputWrite, probe,
                             (DWORD)strlen(probe), &probeWritten, NULL);
    fprintf(stderr, "[shellhelp] selftest write ok=%d n=%lu err=%lu\n",
            (int)probeOk, probeWritten, probeOk ? 0ul : GetLastError());
    fflush(stderr);

    // Wait for the shell to exit, then tear down. The output pump will
    // drain on EOF; the input pump may still be blocked on ReadFile and
    // is detached — process exit cleans it up.
    WaitForSingleObject(pi.hProcess, INFINITE);
    DWORD exitCode = 0;
    GetExitCodeProcess(pi.hProcess, &exitCode);

    InterlockedExchange(&ctx.running, 0);
    pClose(hpc);  // signals EOF on outputRead → output pump returns

    // Close the listener so any accept() blocking in pump_in returns
    // INVALID_SOCKET and the thread observes !running and exits.
    closesocket(ctx.listenSock);
    ctx.listenSock = INVALID_SOCKET;

    // Give the output pump a brief window to flush trailing bytes; if
    // it's stuck the parent process exit will reap it anyway.
    WaitForSingleObject(thOut, 250);

    CloseHandle(thOut);
    CloseHandle(thIn);
    CloseHandle(inputWrite);
    CloseHandle(outputRead);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    WSACleanup();

    // Sentinel JS scans for to detect normal exit + capture child's code.
    printf("\nshellhelp.pty.exit=%lu\n", (unsigned long)exitCode);
    fflush(stdout);
    return 0;
}

int wmain(int argc, wchar_t** argv) {
    if (argc < 2) {
        fwprintf(stderr, L"shellhelp: needs verb (properties|trash|drives|menu|invoke|thumb|dragout|pty)\n");
        return 2;
    }
    if (wcscmp(argv[1], L"properties") == 0) return verb_properties(argc, argv);
    if (wcscmp(argv[1], L"trash") == 0)      return verb_trash(argc, argv);
    if (wcscmp(argv[1], L"drives") == 0)     return verb_drives();
    if (wcscmp(argv[1], L"menu") == 0)       return verb_menu(argc, argv);
    if (wcscmp(argv[1], L"invoke") == 0)     return verb_invoke(argc, argv);
    if (wcscmp(argv[1], L"thumb") == 0)      return verb_thumb(argc, argv);
    if (wcscmp(argv[1], L"dragout") == 0)    return verb_dragout(argc, argv);
    if (wcscmp(argv[1], L"pty") == 0)        return verb_pty(argc, argv);
    fwprintf(stderr, L"shellhelp: unknown verb %ls\n", argv[1]);
    return 2;
}
