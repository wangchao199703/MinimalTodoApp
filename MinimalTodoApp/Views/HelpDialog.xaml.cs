using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace MinimalTodoApp.Views;

/// <summary>使用说明窗口:展示软件的主要功能与操作方式.</summary>
public partial class HelpDialog : Window
{
    // 每个分组:标题 + 若干条说明
    private static readonly (string Title, string[] Lines)[] Sections =
    {
        ("任务", new[]
        {
            "在右下角输入框输入文字、回车或点「添加」即可新建任务.",
            "输入文字后上方会弹出优先级、截止时间与「周期提醒」开关.",
            "时间可选常用快捷项(5 分钟后…1 周后)，也可用「自定义」精确到分钟.",
            "单击任务标题可直接编辑文字；右键任务可编辑、清除截止日期、标记完成、删除.",
            "勾选完成的任务会自动移入「已完成」分组，取消勾选则还原.",
            "拖动任务可自定义排序；标题超长时只显示前部.",
        }),
        ("子待办与缩进", new[]
        {
            "选中任务后按 Tab 键即可缩进一级，成为上一条的子待办；Shift+Tab 提升一级.",
            "右键菜单亦可「作为子待办 / 提升一级」，最多支持 6 级嵌套.",
            "缩进信息会随导入导出 Markdown 一起保留(用列表项的层级表达).",
        }),
        ("语音输入", new[]
        {
            "新任务输入框右侧的🎤按钮会触发 Windows 自带语音听写(等价于 Win+H).",
            "首次使用需在「设置 → 时间和语言 → 语音」中启用语音输入.",
        }),
        ("周期提醒", new[]
        {
            "创建任务时勾选「周期提醒」并设置间隔(默认 30 分钟)即可.",
            "到点后会弹出左下角通知，并在「设置 → 周期提醒声音」开启时播放轻提示音.",
            "任务被勾选完成后自动停止提醒；右键任务可随时切换该开关.",
        }),
        ("导入 / 导出 Markdown", new[]
        {
            "侧边栏「导入导出」可把当前清单导出为 .md，或从 .md 文件导入任务.",
            "导出格式与主流编辑器兼容:分组用 ## 二级标题，每行 - [ ] / - [x] 表示任务.",
            "子待办的缩进按每级两个空格写入，导入时自动还原层级.",
        }),
        ("贴边自动隐藏", new[]
        {
            "把窗口拖到屏幕的上 / 左 / 右边，窗口会播放滑出动画并自动隐藏.",
            "需要时把鼠标移到对应屏幕边缘，窗口会自动滑回；移开后再次自动收起.",
            "再次拖动标题栏即可取消贴边，恢复为普通窗口.",
        }),
        ("分组", new[]
        {
            "左侧为分组栏:点「全部任务」查看所有任务，点分组名切换.",
            "「新建分组」可添加自定义分组；拖动分组可调整顺序.",
            "右键分组可:修改颜色 / 清空分组 / 删除分组(「已完成」不可删除).",
            "侧边栏可拖动调整宽度；点「收起侧边栏」折叠为窄条图标，再点展开.",
        }),
        ("主题与设置", new[]
        {
            "点「修改主题」可切换内置主题(含透明、毛玻璃)，或新建自定义主题.",
            "右上角菜单 →「设置」可开启 / 关闭开机自启动、完成特效、完成音效、周期提醒声音.",
            "排序按钮(标题右侧 ⇅)点击后选择排序方式.",
        }),
        ("窗口", new[]
        {
            "右上角红 / 黄 / 绿:关闭到托盘 / 最小化 / 最大化还原.",
            "关闭仅隐藏到系统托盘，程序后台常驻；双击托盘图标恢复，右键托盘可退出.",
        }),
        ("联系开发者", new[]
        {
            "该软件全部由 AI 生成，有任何建议联系 1248792327@qq.com",
        }),
    };

    public HelpDialog()
    {
        InitializeComponent();
        BuildContent();
        PreviewKeyDown += (_, e) => { if (e.Key == Key.Escape) Close(); };
    }

    private void BuildContent()
    {
        foreach (var (title, lines) in Sections)
        {
            ContentPanel.Children.Add(new TextBlock
            {
                Text = title,
                FontWeight = FontWeights.Bold,
                FontSize = 14,
                Margin = new Thickness(0, 10, 0, 6),
                Foreground = Brush("Accent"),
            });

            foreach (var line in lines)
            {
                ContentPanel.Children.Add(new TextBlock
                {
                    Text = "• " + line,
                    TextWrapping = TextWrapping.Wrap,
                    Margin = new Thickness(2, 0, 0, 5),
                    FontSize = 13,
                    Foreground = Brush("SecondaryText"),
                });
            }
        }
    }

    private static Brush Brush(string key)
        => Application.Current.TryFindResource(key) as Brush ?? Brushes.Gray;

    private void Close_Click(object sender, RoutedEventArgs e) => Close();
}
