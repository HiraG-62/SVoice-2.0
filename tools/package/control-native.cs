using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public sealed class SmokeNativeProcess : IDisposable {
    const uint CreateNewConsole = 0x10;
    const uint CreateSuspended = 0x4;
    const uint KillOnJobClose = 0x2000;
    const uint WaitTimeout = 258;
    const int ExtendedLimitInformation = 9;
    IntPtr job;
    ProcessInformation process;
    public int Id { get { return (int)process.processId; } }

    [StructLayout(LayoutKind.Sequential)] struct StartupInfo {
        public int size;
        public IntPtr reserved, desktop, title;
        public uint x, y, width, height, xChars, yChars, fill, flags;
        public short showWindow, reservedSize;
        public IntPtr reservedData, input, output, error;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInformation {
        public IntPtr process, thread;
        public uint processId, threadId;
    }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimit {
        public long perProcessTime, perJobTime;
        public uint flags;
        public UIntPtr minWorkingSet, maxWorkingSet;
        public uint activeProcessLimit;
        public UIntPtr affinity;
        public uint priority, scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters {
        public ulong readOps, writeOps, otherOps, readBytes, writeBytes, otherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit {
        public BasicLimit basic;
        public IoCounters io;
        public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CreateProcess(string application, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes,
        bool inheritHandles, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInformation information);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int informationClass, ref ExtendedLimit information, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int standardHandle);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AttachConsole(uint processId);
    [DllImport("kernel32.dll")] static extern bool FreeConsole();
    [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GenerateConsoleCtrlEvent(uint ctrlEvent, uint processGroupId);

    static void Require(bool success) { if (!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static string Quote(string argument) {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char value in argument) {
            if (value == '\\') { slashes++; continue; }
            result.Append('\\', value == '"' ? slashes * 2 + 1 : slashes);
            result.Append(value);
            slashes = 0;
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }
    public static SmokeNativeProcess Start(string executable, string[] arguments, string directory, string logDirectory) {
        var child = new SmokeNativeProcess();
        try {
            child.job = CreateJobObject(IntPtr.Zero, null);
            Require(child.job != IntPtr.Zero);
            var limits = new ExtendedLimit();
            limits.basic.flags = KillOnJobClose;
            Require(SetInformationJobObject(child.job, ExtendedLimitInformation, ref limits, (uint)Marshal.SizeOf(limits)));
            using (var output = File.Open(Path.Combine(logDirectory, "process-stdout.log"), FileMode.Create, FileAccess.Write, FileShare.ReadWrite))
            using (var error = File.Open(Path.Combine(logDirectory, "process-stderr.log"), FileMode.Create, FileAccess.Write, FileShare.ReadWrite)) {
                var startup = new StartupInfo();
                startup.size = Marshal.SizeOf(startup);
                startup.flags = 0x101;
                startup.showWindow = 0;
                startup.input = GetStdHandle(-10);
                startup.output = output.SafeFileHandle.DangerousGetHandle();
                startup.error = error.SafeFileHandle.DangerousGetHandle();
                Require(SetHandleInformation(startup.output, 1, 1));
                Require(SetHandleInformation(startup.error, 1, 1));
                var command = new StringBuilder(Quote(executable));
                foreach (string argument in arguments) command.Append(' ').Append(Quote(argument));
                Require(CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true,
                    CreateNewConsole | CreateSuspended, IntPtr.Zero, directory, ref startup, out child.process));
                Require(AssignProcessToJobObject(child.job, child.process.process));
                Require(ResumeThread(child.process.thread) != uint.MaxValue);
            }
            return child;
        } catch {
            if (child.process.process != IntPtr.Zero) TerminateProcess(child.process.process, 1);
            child.Dispose();
            throw;
        }
    }
    public bool Wait(uint milliseconds) { return WaitForSingleObject(process.process, milliseconds) != WaitTimeout; }
    public int ExitCode {
        get { uint code; Require(GetExitCodeProcess(process.process, out code)); return unchecked((int)code); }
    }
    public void Dispose() {
        if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
        if (process.process != IntPtr.Zero) { WaitForSingleObject(process.process, 15000); CloseHandle(process.process); process.process = IntPtr.Zero; }
        if (process.thread != IntPtr.Zero) { CloseHandle(process.thread); process.thread = IntPtr.Zero; }
    }
    public static void Interrupt(uint processId) {
        FreeConsole();
        Require(AttachConsole(processId));
        Require(SetConsoleCtrlHandler(IntPtr.Zero, true));
        try { Require(GenerateConsoleCtrlEvent(0, 0)); Thread.Sleep(100); }
        finally { FreeConsole(); }
    }
}
