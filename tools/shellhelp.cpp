// tools/shellhelp.cpp
//
// Native Win32 helper for SimpleExplorer's right-click actions. Replaces
// PowerShell shell-outs in src/fs.js, eliminating the ~200 ms PowerShell
// cold-start tax that dominates Properties / Delete / drive-list latency.
//
// Build (one-time, MSVC):
//   cl /nologo /EHsc /O2 /utf-8 shellhelp.cpp /link shell32.lib ole32.lib
//
// Verbs:
//   shellhelp properties <path>             — show real Windows Properties
//   shellhelp trash <path> [<path> ...]     — send to Recycle Bin (batched)
//   shellhelp drives                        — emit drive-list JSON to stdout

#include <windows.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <objbase.h>
#include <stdio.h>
#include <wchar.h>

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

int wmain(int argc, wchar_t** argv) {
    if (argc < 2) {
        fwprintf(stderr, L"shellhelp: needs verb (properties|trash|drives)\n");
        return 2;
    }
    if (wcscmp(argv[1], L"properties") == 0) return verb_properties(argc, argv);
    if (wcscmp(argv[1], L"trash") == 0)      return verb_trash(argc, argv);
    if (wcscmp(argv[1], L"drives") == 0)     return verb_drives();
    fwprintf(stderr, L"shellhelp: unknown verb %ls\n", argv[1]);
    return 2;
}
