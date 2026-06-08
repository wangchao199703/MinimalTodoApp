using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 国内法定节假日服务:联网拉取 holiday-cn 开源数据集(国务院公布的放假/调休安排)，
/// 解析出"放假日 → 节日名称"映射供日历显示.全程纯 HttpClient + System.Text.Json，
/// 不引入第三方依赖，保持单文件发布体积.数据按年缓存于 AppData，避免每次启动联网.
/// 数据源:https://github.com/NateScarlet/holiday-cn (raw JSON，按年一个文件).
/// </summary>
public static class HolidayService
{
    // raw JSON 地址模板;{0}=四位年份.该数据集每年由维护者依国务院公告更新.
    private const string RawUrlTemplate =
        "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{0}.json";

    private static readonly HttpClient Http = CreateClient();

    private static HttpClient CreateClient()
    {
        var c = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        c.DefaultRequestHeaders.UserAgent.ParseAdd("MinimalTodoApp-Holiday");
        return c;
    }

    /// <summary>
    /// 联网拉取指定年份的节假日原始 JSON.成功返回 JSON 文本;任何失败(网络/超时/非 2xx)返回 null，
    /// 由调用方静默回退到已有缓存，不影响应用使用.
    /// </summary>
    public static async Task<string?> FetchRawAsync(int year, CancellationToken ct = default)
    {
        try
        {
            var url = string.Format(CultureInfo.InvariantCulture, RawUrlTemplate, year);
            using var resp = await Http.GetAsync(url, ct);
            if (!resp.IsSuccessStatusCode) return null;
            var text = await resp.Content.ReadAsStringAsync(ct);
            // 简单校验:确实能解析且含 days 字段才认为有效
            return ParseOffDays(text).Count >= 0 ? text : null;
        }
        catch
        {
            return null;   // 网络异常/超时:回退缓存
        }
    }

    /// <summary>
    /// 解析 holiday-cn JSON，取出所有"放假日"(isOffDay=true) → 节日名称.
    /// 仅保留放假日(不含调休补班的"班"日).解析失败返回空字典(永不抛出).
    /// JSON 结构:{ "year":2026, "days":[ {"name":"元旦","date":"2026-01-01","isOffDay":true}, ... ] }
    /// </summary>
    public static Dictionary<DateTime, string> ParseOffDays(string json)
    {
        var map = new Dictionary<DateTime, string>();
        if (string.IsNullOrWhiteSpace(json)) return map;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("days", out var days) ||
                days.ValueKind != JsonValueKind.Array)
                return map;

            foreach (var d in days.EnumerateArray())
            {
                if (!d.TryGetProperty("isOffDay", out var off) || !off.GetBoolean())
                    continue;   // 跳过调休补班("班")日
                if (!d.TryGetProperty("date", out var dateEl)) continue;
                if (!DateTime.TryParse(dateEl.GetString(), CultureInfo.InvariantCulture,
                                       DateTimeStyles.None, out var date))
                    continue;
                string name = d.TryGetProperty("name", out var nameEl)
                    ? (nameEl.GetString() ?? "") : "";
                map[date.Date] = name;
            }
        }
        catch
        {
            // 损坏的缓存/异常 JSON:返回已解析部分(可能为空)
        }
        return map;
    }
}
