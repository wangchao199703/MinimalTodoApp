using System;
using System.Diagnostics;
using Microsoft.Win32;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 通过当前用户的注册表 Run 项实现“开机自启动”.无需管理员权限.
/// 键:HKCU\Software\Microsoft\Windows\CurrentVersion\Run\MinimalTodoApp
/// </summary>
public static class StartupManager
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "MinimalTodoApp";

    /// <summary>当前可执行文件完整路径(单文件发布时即 exe 自身).</summary>
    private static string ExePath
    {
        get
        {
            // 单文件发布下 Environment.ProcessPath 指向 exe；兜底用主模块.
            return Environment.ProcessPath
                   ?? Process.GetCurrentProcess().MainModule?.FileName
                   ?? string.Empty;
        }
    }

    /// <summary>当前是否已启用开机自启动.</summary>
    public static bool IsEnabled()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey, false);
            var val = key?.GetValue(ValueName) as string;
            return !string.IsNullOrEmpty(val);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>读取注册表里记录的自启动 exe 路径(去掉前后引号);未启用返回空字符串.</summary>
    public static string GetRegisteredPath()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey, false);
            var val = key?.GetValue(ValueName) as string;
            if (string.IsNullOrEmpty(val)) return string.Empty;
            return val.Trim().Trim('"');
        }
        catch
        {
            return string.Empty;
        }
    }

    /// <summary>
    /// 已启用开机自启动时，确保注册表里的路径与当前 exe 路径一致.
    /// 不一致(如用户挪动了 exe)时删除旧项并写入新路径，确保启动的是当前位置的 exe.
    /// 返回是否进行了更新.
    /// </summary>
    public static bool SyncRegisteredPath()
    {
        try
        {
            var registered = GetRegisteredPath();
            if (string.IsNullOrEmpty(registered)) return false;   // 未启用，不动

            var current = ExePath;
            if (string.IsNullOrEmpty(current)) return false;

            if (string.Equals(registered, current, StringComparison.OrdinalIgnoreCase))
                return false;   // 路径一致，无需更新

            // 路径变了:先删旧项(隐含旧路径无效)，再以当前路径重新注册
            using var key = Registry.CurrentUser.OpenSubKey(RunKey, true)
                            ?? Registry.CurrentUser.CreateSubKey(RunKey);
            if (key == null) return false;
            key.DeleteValue(ValueName, false);
            key.SetValue(ValueName, $"\"{current}\"");
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>启用或关闭开机自启动.返回是否操作成功.</summary>
    public static bool SetEnabled(bool enabled)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey, true)
                            ?? Registry.CurrentUser.CreateSubKey(RunKey);
            if (key == null) return false;

            if (enabled)
            {
                var path = ExePath;
                if (string.IsNullOrEmpty(path)) return false;
                key.SetValue(ValueName, $"\"{path}\"");
            }
            else
            {
                key.DeleteValue(ValueName, false);
            }
            return true;
        }
        catch
        {
            return false;
        }
    }
}
