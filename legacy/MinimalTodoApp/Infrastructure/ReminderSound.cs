using System;
using System.IO;
using System.Media;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 周期提醒的提示音:一段轻短、不刺耳的“叮”——单声马林巴音色(频率 1175Hz，
/// 0.45s 自然衰减)，全程内存合成，无外部音频依赖，便于单文件发布.
/// </summary>
public static class ReminderSound
{
    private const int SampleRate = 44100;
    private static byte[]? _wav;
    private static SoundPlayer? _player;

    public static void Play()
    {
        try
        {
            _wav ??= Build();
            _player ??= new SoundPlayer();
            _player.Stop();
            _player.Stream = new MemoryStream(_wav);
            _player.Play();
        }
        catch
        {
            // 音频设备不可用时静默忽略
        }
    }

    private static byte[] Build()
    {
        const double seconds = 0.45;
        int n = (int)(SampleRate * seconds);
        var samples = new short[n];

        double freq = 1175.0;     // D6 上方略偏，明亮但不尖
        double decay = 6.5;
        int attack = (int)(SampleRate * 0.003);

        double peak = 0;
        double[] buf = new double[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / SampleRate;
            double env = Math.Exp(-decay * t);
            if (i < attack) env *= (double)i / attack;

            double s = Math.Sin(2 * Math.PI * freq * t)
                     + 0.35 * Math.Sin(2 * Math.PI * freq * 2 * t)
                     + 0.15 * Math.Sin(2 * Math.PI * freq * 3 * t);
            buf[i] = env * s;
            peak = Math.Max(peak, Math.Abs(buf[i]));
        }
        if (peak < 1e-6) peak = 1;
        double norm = 0.85 / peak;
        for (int i = 0; i < n; i++)
            samples[i] = (short)(Math.Clamp(buf[i] * norm, -1, 1) * short.MaxValue);

        return WriteWav(samples);
    }

    private static byte[] WriteWav(short[] samples)
    {
        const short channels = 1;
        const short bitsPerSample = 16;
        int byteRate = SampleRate * channels * bitsPerSample / 8;
        short blockAlign = channels * bitsPerSample / 8;
        int dataSize = samples.Length * 2;

        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);
        w.Write(new[] { 'R', 'I', 'F', 'F' });
        w.Write(36 + dataSize);
        w.Write(new[] { 'W', 'A', 'V', 'E' });
        w.Write(new[] { 'f', 'm', 't', ' ' });
        w.Write(16);
        w.Write((short)1);
        w.Write(channels);
        w.Write(SampleRate);
        w.Write(byteRate);
        w.Write(blockAlign);
        w.Write(bitsPerSample);
        w.Write(new[] { 'd', 'a', 't', 'a' });
        w.Write(dataSize);
        foreach (var s in samples) w.Write(s);
        w.Flush();
        return ms.ToArray();
    }
}
