using System;
using System.Collections.Generic;
using System.IO;
using System.Media;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 程序内合成一段清脆悦耳的“成功提示音”，风格类似 iPhone Face ID 解锁 / Apple Pay 支付成功的
/// 两声上行铃音:两颗带泛音的钟/马林巴音色，指数自然衰减、第二声稍高且略迟，听感干净不刺耳.
/// 以 16bit PCM WAV 形式生成于内存并用 <see cref="SoundPlayer"/> 播放，全程不依赖任何外部音频文件，
/// 便于单文件无依赖发布.
/// </summary>
public static class CelebrationSound
{
    private const int SampleRate = 44100;

    private static byte[]? _wav;          // 合成一次后缓存
    private static SoundPlayer? _player;  // 静态持有，避免播放期间被 GC

    /// <summary>异步播放成功提示音(出错时静默忽略，绝不影响主流程).</summary>
    public static void Play()
    {
        try
        {
            _wav ??= Build();
            _player ??= new SoundPlayer();
            _player.Stop();
            _player.Stream = new MemoryStream(_wav);
            _player.Play();   // 在后台线程播放，不阻塞 UI
        }
        catch
        {
            // 音频设备不可用等情况下静默忽略
        }
    }

    /// <summary>合成整段提示音并打包为 WAV 字节数组.</summary>
    private static byte[] Build()
    {
        const double totalSeconds = 0.95;
        int n = (int)(SampleRate * totalSeconds);
        var buf = new double[n];

        // 两声上行铃音:先低后高、第二声略迟，营造“成功/解锁”的明快上扬感.
        AddBell(buf, freq: 880.00, startSec: 0.00, decay: 7.5, amp: 0.55);  // A5
        AddBell(buf, freq: 1318.51, startSec: 0.11, decay: 5.5, amp: 0.65); // E6

        // 归一化到 0.9，避免削顶失真
        double peak = 0;
        foreach (var v in buf) peak = Math.Max(peak, Math.Abs(v));
        if (peak < 1e-6) peak = 1;
        double norm = 0.9 / peak;

        var samples = new List<short>(n);
        for (int i = 0; i < n; i++)
        {
            double v = Math.Clamp(buf[i] * norm, -1.0, 1.0);
            samples.Add((short)(v * short.MaxValue));
        }
        return WriteWav(samples);
    }

    /// <summary>
    /// 在缓冲指定位置叠加一颗钟/马林巴音色:基频 + 若干泛音，配指数衰减包络，
    /// 起始极短淡入以消除爆音.多颗可在缓冲中自然叠加(前一声尾音与后一声重叠).
    /// </summary>
    private static void AddBell(double[] buf, double freq, double startSec, double decay, double amp)
    {
        int start = (int)(SampleRate * startSec);
        int attack = (int)(SampleRate * 0.004);   // 4ms 淡入去爆音

        // 泛音结构(倍频 + 相对幅度)，近钟琴/马林巴的清亮音色
        (double mult, double a)[] partials =
        {
            (1.0, 1.00), (2.0, 0.45), (3.0, 0.22), (4.01, 0.10),
        };

        for (int i = start; i < buf.Length; i++)
        {
            double t = (double)(i - start) / SampleRate;
            double env = Math.Exp(-decay * t);
            if (i - start < attack) env *= (double)(i - start) / attack;

            double s = 0;
            foreach (var (mult, a) in partials)
                s += a * Math.Sin(2 * Math.PI * freq * mult * t);

            buf[i] += amp * env * s;
        }
    }

    /// <summary>把 16bit 单声道 PCM 样本封装成标准 WAV(44 字节头 + 数据).</summary>
    private static byte[] WriteWav(List<short> samples)
    {
        const short channels = 1;
        const short bitsPerSample = 16;
        int byteRate = SampleRate * channels * bitsPerSample / 8;
        short blockAlign = channels * bitsPerSample / 8;
        int dataSize = samples.Count * 2;

        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);

        // RIFF 头
        w.Write(new[] { 'R', 'I', 'F', 'F' });
        w.Write(36 + dataSize);
        w.Write(new[] { 'W', 'A', 'V', 'E' });

        // fmt 块
        w.Write(new[] { 'f', 'm', 't', ' ' });
        w.Write(16);                 // PCM 头长度
        w.Write((short)1);           // PCM
        w.Write(channels);
        w.Write(SampleRate);
        w.Write(byteRate);
        w.Write(blockAlign);
        w.Write(bitsPerSample);

        // data 块
        w.Write(new[] { 'd', 'a', 't', 'a' });
        w.Write(dataSize);
        foreach (var s in samples)
            w.Write(s);

        w.Flush();
        return ms.ToArray();
    }
}
