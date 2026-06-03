using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 与 Windows 系统交互的少量原生 API:鼠标光标位置、所在屏幕工作区、
/// 禁用 Aero Snap 手势. 通过纯 P/Invoke 实现，避免引入 WindowsForms，便于精简单文件发布体积.
/// </summary>
public static class NativeMethods
{
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromPoint(POINT pt, uint dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

    private const uint MONITOR_DEFAULTTONEAREST = 2;

    /// <summary>当前光标位置(屏幕物理坐标).</summary>
    public static Point GetCursorPoint()
    {
        if (GetCursorPos(out var p))
            return new Point(p.X, p.Y);
        return new Point(0, 0);
    }

    /// <summary>当前光标所在屏幕的工作区(不含任务栏，屏幕物理坐标).</summary>
    public static Rect GetCursorScreenWorkArea()
    {
        if (!GetCursorPos(out var p))
        {
            var sw = SystemParameters.WorkArea;
            return new Rect(sw.X, sw.Y, sw.Width, sw.Height);
        }

        var mon = MonitorFromPoint(p, MONITOR_DEFAULTTONEAREST);
        var mi = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
        if (GetMonitorInfo(mon, ref mi))
        {
            return new Rect(
                mi.rcWork.Left, mi.rcWork.Top,
                mi.rcWork.Right - mi.rcWork.Left,
                mi.rcWork.Bottom - mi.rcWork.Top);
        }
        var fallback = SystemParameters.WorkArea;
        return new Rect(fallback.X, fallback.Y, fallback.Width, fallback.Height);
    }

    /// <summary>把物理像素 Rect 转换为给定可视对象所在 DPI 下的 DIP Rect.无法获取 DPI 时原样返回.</summary>
    public static Rect ToDip(Rect physical, Visual? v)
    {
        var src = v == null ? null : PresentationSource.FromVisual(v);
        var m = src?.CompositionTarget?.TransformFromDevice;
        if (m == null) return physical;
        var p1 = m.Value.Transform(new Point(physical.Left, physical.Top));
        var p2 = m.Value.Transform(new Point(physical.Right, physical.Bottom));
        return new Rect(p1, p2);
    }

    /// <summary>把物理像素 Point 转换为给定可视对象所在 DPI 下的 DIP Point.无法获取 DPI 时原样返回.</summary>
    public static Point ToDip(Point physical, Visual? v)
    {
        var src = v == null ? null : PresentationSource.FromVisual(v);
        var m = src?.CompositionTarget?.TransformFromDevice;
        if (m == null) return physical;
        return m.Value.Transform(physical);
    }

    /// <summary>当前光标所在屏幕的工作区(DIP 坐标，与 WPF Left/Top 等同一坐标系).</summary>
    public static Rect GetCursorScreenWorkAreaDip(Visual? v)
        => ToDip(GetCursorScreenWorkArea(), v);

    /// <summary>当前光标位置(DIP 坐标，与 WPF Left/Top 等同一坐标系).</summary>
    public static Point GetCursorPointDip(Visual? v)
        => ToDip(GetCursorPoint(), v);

    // ===== 禁用 Windows 贴边手势(Aero Snap) =====

    private const int GWL_STYLE = -16;
    private const int WS_MAXIMIZEBOX = 0x00010000;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    /// <summary>禁用窗口的 Aero Snap 手势(拖到边缘自动最大化/分屏).</summary>
    public static void DisableAeroSnap(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return;
        try
        {
            int style = GetWindowLong(hwnd, GWL_STYLE);
            // 移除 WS_MAXIMIZEBOX 样式可以禁用 Aero Snap
            style &= ~WS_MAXIMIZEBOX;
            SetWindowLong(hwnd, GWL_STYLE, style);
        }
        catch { /* 静默失败 */ }
    }

    /// <summary>启用窗口的 Aero Snap 手势.</summary>
    public static void EnableAeroSnap(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return;
        try
        {
            int style = GetWindowLong(hwnd, GWL_STYLE);
            // 添加 WS_MAXIMIZEBOX 样式以启用 Aero Snap
            style |= WS_MAXIMIZEBOX;
            SetWindowLong(hwnd, GWL_STYLE, style);
        }
        catch { /* 静默失败 */ }
    }

    // ===== 调起 Windows 系统语音输入(Win+H) =====

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    private const byte VK_LWIN = 0x5B;
    private const byte VK_H = 0x48;
    private const uint KEYEVENTF_KEYUP = 0x0002;

    /// <summary>
    /// 模拟按下 Win+H，唤起 Windows 10/11 自带的「语音输入(听写)」浮窗，
    /// 识别到的文字会输入到当前获得焦点的控件。调用前应先把目标输入框聚焦。
    /// </summary>
    public static void SendWinH()
    {
        keybd_event(VK_LWIN, 0, 0, UIntPtr.Zero);
        keybd_event(VK_H, 0, 0, UIntPtr.Zero);
        keybd_event(VK_H, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    // ===== 把文件移入回收站(自动更新替换旧版 exe 时使用) =====

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEOPSTRUCT
    {
        public IntPtr hwnd;
        public uint wFunc;
        public string pFrom;
        public string? pTo;
        public ushort fFlags;
        public bool fAnyOperationsAborted;
        public IntPtr hNameMappings;
        public string? lpszProgressTitle;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHFileOperation(ref SHFILEOPSTRUCT lpFileOp);

    private const uint FO_DELETE = 0x0003;
    private const ushort FOF_ALLOWUNDO = 0x0040;      // 删除时送回收站(而非永久删除)
    private const ushort FOF_NOCONFIRMATION = 0x0010; // 不弹确认框
    private const ushort FOF_SILENT = 0x0004;         // 不显示进度 UI
    private const ushort FOF_NOERRORUI = 0x0400;      // 出错也不弹 UI

    /// <summary>
    /// 把指定文件移入回收站(而非永久删除)，供自动更新替换旧版 exe 后清理使用.
    /// pFrom 需以双 '\0' 结尾(列表终止符)。失败返回 false，不抛异常.
    /// </summary>
    public static bool MoveToRecycleBin(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !System.IO.File.Exists(path)) return false;
        try
        {
            var op = new SHFILEOPSTRUCT
            {
                wFunc = FO_DELETE,
                pFrom = path + '\0' + '\0',
                fFlags = (ushort)(FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI),
            };
            return SHFileOperation(ref op) == 0 && !op.fAnyOperationsAborted;
        }
        catch
        {
            return false;
        }
    }
}
