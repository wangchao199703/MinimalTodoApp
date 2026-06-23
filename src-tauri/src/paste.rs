//! 「双击剪贴项 → 自动粘贴到原光标处」的 Win32 实现(移植自 Ditto 的 ExternalWindowTracker)。
//!
//! 思路:后台线程持续记录「当前前台窗口 + 其焦点控件」,**排除本进程自己的窗口**——于是
//! 用户点开本应用时,早已记下他原本在哪个窗口、哪个输入框里。粘贴时:写好系统剪贴板 →
//! 还原前台焦点(绕过 Windows 前台锁 + AttachThreadInput + SetForegroundWindow/SetFocus)→
//! 模拟 Ctrl+V,目标窗口即在光标处粘贴。
//!
//! 全程裸 FFI(对齐本仓库 window.rs 既有风格),不引入 windows crate。

use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

type Hwnd = isize;

/// 粘贴按键:多数应用 Ctrl+V,极少数(部分终端/老控件)用 Shift+Insert。
#[derive(Clone, Copy)]
pub enum PasteKeys {
    CtrlV,
    ShiftInsert,
}

impl PasteKeys {
    pub fn from_setting(s: &str) -> Self {
        if s == "shift_insert" {
            PasteKeys::ShiftInsert
        } else {
            PasteKeys::CtrlV
        }
    }
}

/// 粘贴结果:成功 / 无目标窗口 / 目标是更高权限窗口被系统拦(已写剪贴板,需手动粘贴)。
pub enum PasteOutcome {
    Pasted,
    NoTarget,
    BlockedElevated,
}

#[repr(C)]
struct GuiThreadInfo {
    cb_size: u32,
    flags: u32,
    hwnd_active: Hwnd,
    hwnd_focus: Hwnd,
    hwnd_capture: Hwnd,
    hwnd_menu_owner: Hwnd,
    hwnd_move_size: Hwnd,
    hwnd_caret: Hwnd,
    rc_caret: [i32; 4],
}

#[link(name = "user32")]
extern "system" {
    fn GetForegroundWindow() -> Hwnd;
    fn SetForegroundWindow(hwnd: Hwnd) -> i32;
    fn SetFocus(hwnd: Hwnd) -> Hwnd;
    fn BringWindowToTop(hwnd: Hwnd) -> i32;
    fn IsWindow(hwnd: Hwnd) -> i32;
    fn IsIconic(hwnd: Hwnd) -> i32;
    fn ShowWindow(hwnd: Hwnd, cmd: i32) -> i32;
    fn GetWindowThreadProcessId(hwnd: Hwnd, pid: *mut u32) -> u32;
    fn AttachThreadInput(id_attach: u32, id_attach_to: u32, attach: i32) -> i32;
    fn GetGUIThreadInfo(thread: u32, info: *mut GuiThreadInfo) -> i32;
    fn SystemParametersInfoW(action: u32, ui: u32, pv: *mut core::ffi::c_void, win_ini: u32) -> i32;
    fn keybd_event(vk: u8, scan: u8, flags: u32, extra: usize);
}

#[link(name = "kernel32")]
extern "system" {
    fn GetCurrentProcessId() -> u32;
    fn GetCurrentThreadId() -> u32;
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
    fn CloseHandle(h: isize) -> i32;
}

#[link(name = "advapi32")]
extern "system" {
    fn OpenProcessToken(process: isize, access: u32, token: *mut isize) -> i32;
    fn GetTokenInformation(
        token: isize,
        class: i32,
        info: *mut core::ffi::c_void,
        len: u32,
        ret: *mut u32,
    ) -> i32;
    fn GetSidSubAuthorityCount(sid: *mut core::ffi::c_void) -> *mut u8;
    fn GetSidSubAuthority(sid: *mut core::ffi::c_void, idx: u32) -> *mut u32;
}

const SPI_GETFOREGROUNDLOCKTIMEOUT: u32 = 0x2000;
const SPI_SETFOREGROUNDLOCKTIMEOUT: u32 = 0x2001;
const SW_RESTORE: i32 = 9;
const KEYEVENTF_KEYUP: u32 = 0x0002;
const VK_CONTROL: u8 = 0x11;
const VK_SHIFT: u8 = 0x10;
const VK_MENU: u8 = 0x12; // Alt
const VK_LWIN: u8 = 0x5B;
const VK_RWIN: u8 = 0x5C;
const VK_V: u8 = 0x56;
const VK_INSERT: u8 = 0x2D;
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const TOKEN_QUERY: u32 = 0x0008;
const TOKEN_INTEGRITY_LEVEL: i32 = 25;

/// 记录「上一个外部前台窗口」及其焦点控件(供粘贴时还原)。
pub struct ForegroundTracker {
    window: AtomicIsize,
    focus: AtomicIsize,
}

impl ForegroundTracker {
    pub fn new() -> Self {
        ForegroundTracker { window: AtomicIsize::new(0), focus: AtomicIsize::new(0) }
    }
}

/// 启动后台追踪线程:每 200ms 记一次前台窗口(排除本进程窗口)。
pub fn start_tracking(state: Arc<ForegroundTracker>) {
    std::thread::spawn(move || {
        let our_pid = unsafe { GetCurrentProcessId() };
        loop {
            unsafe { track_once(&state, our_pid) };
            std::thread::sleep(Duration::from_millis(200));
        }
    });
}

unsafe fn track_once(state: &ForegroundTracker, our_pid: u32) {
    let fg = GetForegroundWindow();
    if fg == 0 || IsWindow(fg) == 0 {
        return;
    }
    let mut pid = 0u32;
    let tid = GetWindowThreadProcessId(fg, &mut pid);
    if pid == our_pid || pid == 0 {
        return; // 本应用自己的窗口(主窗口/设置窗/编辑窗)不记
    }
    // 取前台线程真正持光标的控件;取不到则退回顶层窗口
    let mut gti: GuiThreadInfo = core::mem::zeroed();
    gti.cb_size = core::mem::size_of::<GuiThreadInfo>() as u32;
    let focus = if GetGUIThreadInfo(tid, &mut gti) != 0 && gti.hwnd_focus != 0 {
        gti.hwnd_focus
    } else {
        fg
    };
    state.window.store(fg, Ordering::SeqCst);
    state.focus.store(focus, Ordering::SeqCst);
}

/// 把焦点还给记下的窗口并模拟粘贴键。须在系统剪贴板已写好目标内容之后调用。
/// 若目标是更高完整性级别(管理员窗口),普通权限发键会被 UIPI 拦,返回 BlockedElevated
/// (剪贴板已写好,调用方提示用户手动粘贴),不强行尝试。
pub fn paste_to_previous(state: &ForegroundTracker, keys: PasteKeys) -> PasteOutcome {
    let target = state.window.load(Ordering::SeqCst);
    let focus = state.focus.load(Ordering::SeqCst);
    if target == 0 || unsafe { IsWindow(target) } == 0 {
        return PasteOutcome::NoTarget;
    }
    unsafe {
        release_modifiers();
        restore_foreground(target, focus);
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(target, &mut pid);
        if target_blocks_input(pid) {
            return PasteOutcome::BlockedElevated;
        }
        // 给目标窗口真正激活留点时间,再发粘贴键
        std::thread::sleep(Duration::from_millis(60));
        send_paste_keys(keys);
    }
    PasteOutcome::Pasted
}

/// 目标进程完整性级别高于本进程(管理员/系统窗口)→ 普通权限 SendInput 会被 UIPI 拦截。
unsafe fn target_blocks_input(target_pid: u32) -> bool {
    match (integrity_level(GetCurrentProcessId()), integrity_level(target_pid)) {
        (Some(ours), Some(theirs)) => theirs > ours,
        _ => false, // 取不到完整性级别就不拦,照常尝试发键
    }
}

/// 读进程完整性级别(SID 末位子授权 RID:Medium=0x2000,High=0x3000,System=0x4000)。
unsafe fn integrity_level(pid: u32) -> Option<u32> {
    let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if h == 0 {
        return None;
    }
    let mut token: isize = 0;
    if OpenProcessToken(h, TOKEN_QUERY, &mut token) == 0 {
        CloseHandle(h);
        return None;
    }
    let mut len: u32 = 0;
    GetTokenInformation(token, TOKEN_INTEGRITY_LEVEL, core::ptr::null_mut(), 0, &mut len);
    let mut result = None;
    if len > 0 {
        let mut buf = vec![0u8; len as usize];
        let ok = GetTokenInformation(
            token,
            TOKEN_INTEGRITY_LEVEL,
            buf.as_mut_ptr() as *mut core::ffi::c_void,
            len,
            &mut len,
        );
        if ok != 0 {
            // TOKEN_MANDATORY_LABEL { Label: SID_AND_ATTRIBUTES { Sid: PSID, .. } }:首字段即 SID 指针
            let sid = *(buf.as_ptr() as *const *mut core::ffi::c_void);
            if !sid.is_null() {
                let count_ptr = GetSidSubAuthorityCount(sid);
                if !count_ptr.is_null() && *count_ptr > 0 {
                    let rid_ptr = GetSidSubAuthority(sid, (*count_ptr - 1) as u32);
                    if !rid_ptr.is_null() {
                        result = Some(*rid_ptr);
                    }
                }
            }
        }
    }
    CloseHandle(token);
    CloseHandle(h);
    result
}

/// 还原目标窗口为前台并把焦点落到原控件:绕过前台锁 + AttachThreadInput(对齐 Ditto ActivateTarget)。
unsafe fn restore_foreground(target: Hwnd, focus: Hwnd) {
    // 临时关掉「前台锁定超时」,否则 Windows 会拒绝程序抢前台(只闪任务栏)
    let mut timeout: u32 = 0;
    SystemParametersInfoW(
        SPI_GETFOREGROUNDLOCKTIMEOUT,
        0,
        &mut timeout as *mut u32 as *mut core::ffi::c_void,
        0,
    );
    SystemParametersInfoW(SPI_SETFOREGROUNDLOCKTIMEOUT, 0, core::ptr::null_mut(), 0);

    if IsIconic(target) != 0 {
        ShowWindow(target, SW_RESTORE);
    }

    let cur_tid = GetCurrentThreadId();
    // 挂到当前前台线程,SetForegroundWindow 才稳
    let fg_tid = GetWindowThreadProcessId(GetForegroundWindow(), core::ptr::null_mut());
    let attached_fg = fg_tid != cur_tid && AttachThreadInput(fg_tid, cur_tid, 1) != 0;

    BringWindowToTop(target);
    SetForegroundWindow(target);

    // 精确还原焦点控件:挂到目标线程后 SetFocus(跨线程 SetFocus 必须先 AttachThreadInput)
    if focus != 0 && IsWindow(focus) != 0 {
        let tgt_tid = GetWindowThreadProcessId(target, core::ptr::null_mut());
        let attached_tgt = tgt_tid != cur_tid && AttachThreadInput(tgt_tid, cur_tid, 1) != 0;
        SetFocus(focus);
        if attached_tgt {
            AttachThreadInput(tgt_tid, cur_tid, 0);
        }
    }

    if attached_fg {
        AttachThreadInput(fg_tid, cur_tid, 0);
    }

    // 还原前台锁超时(timeout 的值经 pvParam 直接回填)
    SystemParametersInfoW(
        SPI_SETFOREGROUNDLOCKTIMEOUT,
        0,
        timeout as usize as *mut core::ffi::c_void,
        0,
    );
}

/// 松开可能仍按住的修饰键(召唤热键残留的 Ctrl/Alt 等会污染粘贴),对齐 Ditto AllKeysUp。
unsafe fn release_modifiers() {
    for vk in [VK_CONTROL, VK_SHIFT, VK_MENU, VK_LWIN, VK_RWIN] {
        keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
    }
}

unsafe fn send_paste_keys(keys: PasteKeys) {
    let (modifier, key) = match keys {
        PasteKeys::CtrlV => (VK_CONTROL, VK_V),
        PasteKeys::ShiftInsert => (VK_SHIFT, VK_INSERT),
    };
    keybd_event(modifier, 0, 0, 0);
    keybd_event(key, 0, 0, 0);
    keybd_event(key, 0, KEYEVENTF_KEYUP, 0);
    keybd_event(modifier, 0, KEYEVENTF_KEYUP, 0);
}
