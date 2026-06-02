using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 通过未公开的 SetWindowCompositionAttribute 为窗口启用“毛玻璃”(Acrylic 模糊)效果.
/// 仅 Windows 10/11 生效；失败时静默降级为普通半透明.
/// </summary>
public static class AcrylicHelper
{
    [StructLayout(LayoutKind.Sequential)]
    private struct AccentPolicy
    {
        public int AccentState;
        public int AccentFlags;
        public uint GradientColor;   // AABBGGRR
        public int AnimationId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WindowCompositionAttributeData
    {
        public int Attribute;
        public IntPtr Data;
        public int SizeOfData;
    }

    private const int WCA_ACCENT_POLICY = 19;
    private const int ACCENT_DISABLED = 0;
    private const int ACCENT_ENABLE_ACRYLICBLURBEHIND = 4;
    private const int DRAW_ALL_BORDERS = 0x20 | 0x40 | 0x80 | 0x100;

    [DllImport("user32.dll")]
    private static extern int SetWindowCompositionAttribute(IntPtr hwnd, ref WindowCompositionAttributeData data);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    private const int DWMWCP_DEFAULT = 0;
    private const int DWMWCP_ROUND = 2;

    /// <summary>
    /// Windows 11:让 DWM 把窗口(含 Acrylic 模糊背景)四角圆角。毛玻璃主题下窗口为方形 HWND，
    /// Acrylic 会填满方角，需用此让系统圆角。其余主题已由 WPF 圆角边框裁剪，传 false 还原默认。
    /// </summary>
    public static void SetRoundedCorners(Window window, bool rounded)
    {
        try
        {
            var hwnd = new WindowInteropHelper(window).Handle;
            if (hwnd == IntPtr.Zero) return;
            int pref = rounded ? DWMWCP_ROUND : DWMWCP_DEFAULT;
            DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ref pref, sizeof(int));
        }
        catch
        {
            // 旧系统(< Win11)无此属性,忽略
        }
    }

    /// <summary>开启毛玻璃模糊.tintArgb 为玻璃底色(含透明度，AARRGGBB).</summary>
    public static void Enable(Window window, uint tintArgb)
    {
        Apply(window, ACCENT_ENABLE_ACRYLICBLURBEHIND, tintArgb);
    }

    /// <summary>关闭毛玻璃模糊.</summary>
    public static void Disable(Window window)
    {
        Apply(window, ACCENT_DISABLED, 0);
    }

    private static void Apply(Window window, int accentState, uint tintArgb)
    {
        try
        {
            var hwnd = new WindowInteropHelper(window).Handle;
            if (hwnd == IntPtr.Zero) return;

            // 从 AARRGGBB 转为 Acrylic 需要的 AABBGGRR
            uint a = (tintArgb >> 24) & 0xFF;
            uint r = (tintArgb >> 16) & 0xFF;
            uint g = (tintArgb >> 8) & 0xFF;
            uint b = tintArgb & 0xFF;
            uint abgr = (a << 24) | (b << 16) | (g << 8) | r;

            var accent = new AccentPolicy
            {
                AccentState = accentState,
                AccentFlags = accentState == ACCENT_ENABLE_ACRYLICBLURBEHIND ? DRAW_ALL_BORDERS : 0,
                GradientColor = abgr
            };

            int size = Marshal.SizeOf(accent);
            IntPtr ptr = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.StructureToPtr(accent, ptr, false);
                var data = new WindowCompositionAttributeData
                {
                    Attribute = WCA_ACCENT_POLICY,
                    Data = ptr,
                    SizeOfData = size
                };
                SetWindowCompositionAttribute(hwnd, ref data);
            }
            finally
            {
                Marshal.FreeHGlobal(ptr);
            }
        }
        catch
        {
            // 旧系统或调用失败:忽略，保持普通半透明外观
        }
    }
}
