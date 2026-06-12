use serde::{Deserialize, Serialize};

/// 任务。字段与旧版 WPF 的 TodoItem 一一对应(运行时派生属性由前端计算)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub is_completed: bool,
    /// "YYYY-MM-DD HH:mm" 文本,空格分隔(全应用统一约定)
    pub due_date: Option<String>,
    /// None = 无标签(对应旧版 Guid.Empty)
    pub group_id: Option<String>,
    /// 完成前所属标签,用于取消完成时还原
    pub original_group_id: Option<String>,
    /// 1=Low 2=Medium 3=High(对齐旧版枚举值)
    pub priority: i32,
    pub order_index: i64,
    pub indent_level: i32,
    pub parent_id: Option<String>,
    pub is_collapsed: bool,
    pub is_pinned: bool,
    /// 四象限手动覆盖 1~4,None=自动派生
    pub quadrant_override: Option<i32>,
    pub reminder_enabled: bool,
    pub reminder_interval_minutes: i32,
    pub last_reminded_at: Option<String>,
    pub created_at: String,
}

/// 标签(旧版称分组)。内置视图(全部/已完成/四象限/标签看板)不入库
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub order_index: i64,
    pub color: String,
    pub icon: String,
    pub icon_image: String,
    pub is_collapsed: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub group_id: Option<String>,
    pub due_date: Option<String>,
    pub priority: Option<i32>,
    pub parent_id: Option<String>,
    pub indent_level: Option<i32>,
    pub reminder_enabled: Option<bool>,
    pub reminder_interval_minutes: Option<i32>,
}

/// 补丁式更新:None=不变;可选文本字段传空串表示清空(serde 区分 None 与 "")
#[derive(Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub id: String,
    pub title: Option<String>,
    pub is_completed: Option<bool>,
    pub due_date: Option<String>,
    pub group_id: Option<String>,
    pub original_group_id: Option<String>,
    pub priority: Option<i32>,
    pub indent_level: Option<i32>,
    pub parent_id: Option<String>,
    pub is_collapsed: Option<bool>,
    pub is_pinned: Option<bool>,
    /// 0=清除覆盖,1~4=设置象限
    pub quadrant_override: Option<i32>,
    pub reminder_enabled: Option<bool>,
    pub reminder_interval_minutes: Option<i32>,
    pub last_reminded_at: Option<String>,
}

/// 用户自定义主题:18 个颜色键的字典,缺键由前端用 Light 兜底
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomTheme {
    pub key: String,
    pub display: String,
    pub colors: std::collections::HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGroupRequest {
    pub id: String,
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub icon_image: Option<String>,
    pub is_collapsed: Option<bool>,
}
