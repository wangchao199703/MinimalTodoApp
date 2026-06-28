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

/// 便签(Markdown 正文)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub custom_title: String,
    pub content: String,
    /// None = 收集箱(未分组)
    pub group_id: Option<String>,
    pub order_index: i64,
    pub created_at: String,
    pub updated_at: String,
    /// 软删除时间(回收站);None = 未删除
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteGroup {
    pub id: String,
    pub name: String,
    pub order_index: i64,
    pub is_collapsed: bool,
    /// 父分组 id(None = 顶层分组);支持无限嵌套子分组
    pub parent_id: Option<String>,
}

/// 补丁式更新便签:None=不变;可清空文本字段传空串
#[derive(Debug, Deserialize)]
pub struct UpdateNoteRequest {
    pub id: String,
    pub title: Option<String>,
    pub custom_title: Option<String>,
    pub content: Option<String>,
    pub group_id: Option<String>,
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

/// 剪贴板记录(后台监听系统剪贴板自动入库)。
/// 文本类直接存 text;图片类把 PNG 存到 clipboard-images/ 目录,image_path 存绝对路径,
/// thumbnail_b64 内嵌缩略图(data: 形式,前端始终可渲染,不依赖 asset 作用域)。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipItem {
    pub id: i64,
    /// "text" | "image"
    pub kind: String,
    pub text: Option<String>,
    pub image_path: Option<String>,
    pub thumbnail_b64: Option<String>,
    /// 内容 SHA256,用于「与上一条相同则跳过」去重
    pub hash: String,
    /// 毫秒时间戳(剪贴板项高频、轻量,沿用 ShellPicker 的整型时间)
    pub created_at: i64,
    pub pinned: bool,
    /// 关联的剪贴板标签 id 列表(由 clip_tags 填充)
    pub tag_ids: Vec<i64>,
    /// 用户备注(可选)
    pub note: Option<String>,
}

/// 剪贴板标签(独立于待办「标签/分组」,自成一套,挂在剪贴板第二侧栏)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipTag {
    pub id: i64,
    pub name: String,
    pub color: String,
}

/// 待插入的新剪贴记录(监听线程构造)
pub struct NewClip {
    pub kind: String,
    pub text: Option<String>,
    pub image_path: Option<String>,
    pub thumbnail_b64: Option<String>,
    pub hash: String,
}
