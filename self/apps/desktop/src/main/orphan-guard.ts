import { loadKoffi } from './orphan-guard-koffi'

type JobObjectBasicLimitInformation = {
  PerProcessUserTimeLimit: number
  PerJobUserTimeLimit: number
  LimitFlags: number
  MinimumWorkingSetSize: number
  MaximumWorkingSetSize: number
  ActiveProcessLimit: number
  Affinity: number
  PriorityClass: number
  SchedulingClass: number
}

type IoCounters = {
  ReadOperationCount: number
  WriteOperationCount: number
  OtherOperationCount: number
  ReadTransferCount: number
  WriteTransferCount: number
  OtherTransferCount: number
}

type JobObjectExtendedLimitInformation = {
  BasicLimitInformation: JobObjectBasicLimitInformation
  IoInfo: IoCounters
  ProcessMemoryLimit: number
  JobMemoryLimit: number
  PeakProcessMemoryUsed: number
  PeakJobMemoryUsed: number
}

type Win32Bindings = {
  CreateJobObjectW: (attributes: null, name: null) => unknown
  SetInformationJobObject: (
    job: unknown,
    infoClass: number,
    info: JobObjectExtendedLimitInformation,
    infoSize: number,
  ) => number
  OpenProcess: (access: number, inheritHandle: boolean, processId: number) => unknown
  AssignProcessToJobObject: (job: unknown, process: unknown) => number
  CloseHandle: (handle: unknown) => number
  infoSize: number
}

const PROCESS_SET_QUOTA = 0x0100
const PROCESS_TERMINATE = 0x0001
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS = 9

let initialized = false
let jobHandle: unknown | null = null
let win32Bindings: Win32Bindings | null = null

function isValidPid(pid: number): boolean {
  return Number.isInteger(pid) && pid > 0
}

function isNullHandle(handle: unknown): boolean {
  return handle == null || handle === 0 || handle === 0n
}

function createExtendedLimitInformation(): JobObjectExtendedLimitInformation {
  return {
    BasicLimitInformation: {
      PerProcessUserTimeLimit: 0,
      PerJobUserTimeLimit: 0,
      LimitFlags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
      MinimumWorkingSetSize: 0,
      MaximumWorkingSetSize: 0,
      ActiveProcessLimit: 0,
      Affinity: 0,
      PriorityClass: 0,
      SchedulingClass: 0,
    },
    IoInfo: {
      ReadOperationCount: 0,
      WriteOperationCount: 0,
      OtherOperationCount: 0,
      ReadTransferCount: 0,
      WriteTransferCount: 0,
      OtherTransferCount: 0,
    },
    ProcessMemoryLimit: 0,
    JobMemoryLimit: 0,
    PeakProcessMemoryUsed: 0,
    PeakJobMemoryUsed: 0,
  }
}

function closeHandleSafely(bindings: Win32Bindings, handle: unknown): void {
  if (isNullHandle(handle)) {
    return
  }

  try {
    bindings.CloseHandle(handle)
  } catch {
    // Best-effort cleanup only. The guard must never fail closed.
  }
}

function loadWin32Bindings(): Win32Bindings {
  const koffi = loadKoffi()
  koffi.pointer('HANDLE', koffi.opaque())
  const JOBOBJECT_BASIC_LIMIT_INFORMATION = koffi.struct('JOBOBJECT_BASIC_LIMIT_INFORMATION', {
    PerProcessUserTimeLimit: 'int64_t',
    PerJobUserTimeLimit: 'int64_t',
    LimitFlags: 'uint32_t',
    MinimumWorkingSetSize: 'uintptr_t',
    MaximumWorkingSetSize: 'uintptr_t',
    ActiveProcessLimit: 'uint32_t',
    Affinity: 'uintptr_t',
    PriorityClass: 'uint32_t',
    SchedulingClass: 'uint32_t',
  })
  const IO_COUNTERS = koffi.struct('IO_COUNTERS', {
    ReadOperationCount: 'uint64_t',
    WriteOperationCount: 'uint64_t',
    OtherOperationCount: 'uint64_t',
    ReadTransferCount: 'uint64_t',
    WriteTransferCount: 'uint64_t',
    OtherTransferCount: 'uint64_t',
  })
  const JOBOBJECT_EXTENDED_LIMIT_INFORMATION = koffi.struct('JOBOBJECT_EXTENDED_LIMIT_INFORMATION', {
    BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION,
    IoInfo: IO_COUNTERS,
    ProcessMemoryLimit: 'uintptr_t',
    JobMemoryLimit: 'uintptr_t',
    PeakProcessMemoryUsed: 'uintptr_t',
    PeakJobMemoryUsed: 'uintptr_t',
  })
  const kernel32 = koffi.load('kernel32.dll')

  return {
    CreateJobObjectW: kernel32.func(
      'HANDLE __stdcall CreateJobObjectW(void *lpJobAttributes, const char16_t *lpName)',
    ) as Win32Bindings['CreateJobObjectW'],
    SetInformationJobObject: kernel32.func(
      'int __stdcall SetInformationJobObject(HANDLE hJob, int JobObjectInfoClass, _Inout_ JOBOBJECT_EXTENDED_LIMIT_INFORMATION *lpJobObjectInfo, uint32_t cbJobObjectInfoLength)',
    ) as Win32Bindings['SetInformationJobObject'],
    OpenProcess: kernel32.func(
      'HANDLE __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)',
    ) as unknown as Win32Bindings['OpenProcess'],
    AssignProcessToJobObject: kernel32.func(
      'int __stdcall AssignProcessToJobObject(HANDLE hJob, HANDLE hProcess)',
    ) as Win32Bindings['AssignProcessToJobObject'],
    CloseHandle: kernel32.func(
      'int __stdcall CloseHandle(HANDLE hObject)',
    ) as Win32Bindings['CloseHandle'],
    infoSize: koffi.sizeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION),
  }
}

export function initOrphanGuard(): void {
  if (initialized) {
    return
  }

  initialized = true

  if (process.platform !== 'win32') {
    console.log('[nous:desktop] orphan-guard: POSIX platform, using process groups (no-op)')
    return
  }

  try {
    win32Bindings = loadWin32Bindings()

    const handle = win32Bindings.CreateJobObjectW(null, null)
    if (isNullHandle(handle)) {
      throw new Error('CreateJobObjectW returned NULL')
    }

    const limitInfo = createExtendedLimitInformation()
    const success = win32Bindings.SetInformationJobObject(
      handle,
      JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
      limitInfo,
      win32Bindings.infoSize,
    )

    if (!success) {
      closeHandleSafely(win32Bindings, handle)
      throw new Error('SetInformationJobObject returned FALSE')
    }

    jobHandle = handle
    console.log('[nous:desktop] orphan-guard: Job Object created')
  } catch (error) {
    jobHandle = null
    win32Bindings = null
    console.error('[nous:desktop] orphan-guard: initialization failed:', error)
  }
}

export function registerChild(pid: number): void {
  if (!isValidPid(pid)) {
    return
  }

  if (process.platform !== 'win32' || !jobHandle || !win32Bindings) {
    return
  }

  let processHandle: unknown = null

  try {
    processHandle = win32Bindings.OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid)
    if (isNullHandle(processHandle)) {
      throw new Error('OpenProcess returned NULL')
    }

    const success = win32Bindings.AssignProcessToJobObject(jobHandle, processHandle)
    if (!success) {
      throw new Error('AssignProcessToJobObject returned FALSE')
    }

    console.log(`[nous:desktop] orphan-guard: registered child pid=${pid}`)
  } catch (error) {
    console.error(`[nous:desktop] orphan-guard: failed to register child pid=${pid}:`, error)
  } finally {
    if (win32Bindings && !isNullHandle(processHandle)) {
      closeHandleSafely(win32Bindings, processHandle)
    }
  }
}
