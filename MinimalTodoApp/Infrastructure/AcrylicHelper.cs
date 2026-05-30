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
