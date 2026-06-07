using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using MinimalTodoApp.Infrastructure;

namespace MinimalTodoApp.Views;

/// <summary>使用说明窗口:展示软件的主要功能与操作方式.内容按当前语言从资源字典解析.</summary>
public partial class HelpDialog : Window
{
    // 每个分组:标题 key + 若干条说明 key(实际文本在 Lang/Strings.*.xaml)
    private static readonly (string TitleKey, string[] LineKeys)[] Sections =
    {
        ("S.Help.Tasks.Title", new[]
        {
            "S.Help.Tasks.L1", "S.Help.Tasks.L2", "S.Help.Tasks.L3",
            "S.Help.Tasks.L4", "S.Help.Tasks.L5", "S.Help.Tasks.L6", "S.Help.Tasks.L7",
            "S.Help.Tasks.L8",
        }),
        ("S.Help.Subtasks.Title", new[]
        {
            "S.Help.Subtasks.L1", "S.Help.Subtasks.L2", "S.Help.Subtasks.L3",
        }),
        ("S.Help.Schedule.Title", new[]
        {
            "S.Help.Schedule.L1", "S.Help.Schedule.L2", "S.Help.Schedule.L3", "S.Help.Schedule.L4",
        }),
        ("S.Help.Voice.Title", new[]
        {
            "S.Help.Voice.L1", "S.Help.Voice.L2",
        }),
        ("S.Help.Reminder.Title", new[]
        {
            "S.Help.Reminder.L1", "S.Help.Reminder.L2", "S.Help.Reminder.L3",
        }),
        ("S.Help.IO.Title", new[]
        {
            "S.Help.IO.L1", "S.Help.IO.L2", "S.Help.IO.L3",
        }),
        ("S.Help.Dock.Title", new[]
        {
            "S.Help.Dock.L1", "S.Help.Dock.L2", "S.Help.Dock.L3",
        }),
        ("S.Help.Group.Title", new[]
        {
            "S.Help.Group.L1", "S.Help.Group.L2", "S.Help.Group.L3", "S.Help.Group.L4",
        }),
        ("S.Help.Theme.Title", new[]
        {
            "S.Help.Theme.L1", "S.Help.Theme.L2", "S.Help.Theme.L3", "S.Help.Theme.L4",
            "S.Help.Theme.L5", "S.Help.Theme.L6", "S.Help.Theme.L7",
        }),
        ("S.Help.Window.Title", new[]
        {
            "S.Help.Window.L1", "S.Help.Window.L2", "S.Help.Window.L3", "S.Help.Window.L4",
        }),
        ("S.Help.Update.Title", new[]
        {
            "S.Help.Update.L1", "S.Help.Update.L2", "S.Help.Update.L3",
        }),
        ("S.Help.Contact.Title", new[]
        {
            "S.Help.Contact.L1",
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
        foreach (var (titleKey, lineKeys) in Sections)
        {
            ContentPanel.Children.Add(new TextBlock
            {
                Text = Loc.T(titleKey),
                FontWeight = FontWeights.Bold,
                FontSize = 14,
                Margin = new Thickness(0, 10, 0, 6),
                Foreground = Brush("Accent"),
            });

            foreach (var key in lineKeys)
            {
                ContentPanel.Children.Add(new TextBlock
                {
                    Text = "• " + Loc.T(key),
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
