# Cấu trúc Database - Social Tracking Dashboard

## Tổng quan
Database này được thiết kế để theo dõi và phân tích tin tức từ các nguồn mạng xã hội khác nhau. Hệ thống bao gồm 4 bảng chính với các mối quan hệ được định nghĩa rõ ràng.

## Sơ đồ quan hệ
```
news ──┬── sources ── types
       └── sentiments
```

## Chi tiết các bảng

### 1. Bảng `news` 📰
**Mục đích**: Lưu trữ thông tin chi tiết về các bài viết tin tức

| Trường | Kiểu dữ liệu | Mô tả |
|--------|-------------|-------|
| `id` | UUID (PK) | Khóa chính, định danh duy nhất cho mỗi bài tin |
| `sourceId` | UUID (FK) | Tham chiếu đến nguồn tin (bảng sources) |
| `groupId` | UUID | ID nhóm phân loại tin tức |
| `content` | String | Nội dung đầy đủ của bài tin |
| `link` | String | Đường dẫn URL đến bài tin gốc |
| `publishDate` | Timestamp | Thời gian xuất bản bài tin |
| `sentimentId` | UUID (FK) | Tham chiếu đến cảm xúc/tâm trạng (bảng sentiments) |
| `summary` | String | Tóm tắt nội dung bài tin |
| `keywords` | String | Từ khóa liên quan đến bài tin |
| `screenshot` | String | Đường dẫn đến ảnh chụp màn hình |
| `metadata` | JSONB | Dữ liệu bổ sung dạng JSON |
| `createdAt` | Timestamp | Thời gian tạo bản ghi |
| `updatedAt` | Timestamp | Thời gian cập nhật cuối cùng |
| `deletedAt` | Timestamp | Thời gian xóa (soft delete) |

### 2. Bảng `sources` 📡
**Mục đích**: Quản lý các nguồn tin tức (Facebook, Telegram, website, v.v.)

| Trường | Kiểu dữ liệu | Mô tả |
|--------|-------------|-------|
| `id` | UUID (PK) | Khóa chính, định danh duy nhất cho mỗi nguồn |
| `name` | String | Tên của nguồn tin |
| `link` | String | Đường dẫn đến nguồn tin |
| `pageId` | String | ID trang/kênh trên platform |
| `typeId` | UUID (FK) | Tham chiếu đến loại nguồn (bảng types) |
| `parentId` | UUID | Tham chiếu đến nguồn cha (cấu trúc phân cấp) |
| `createdAt` | Timestamp | Thời gian tạo bản ghi |
| `updatedAt` | Timestamp | Thời gian cập nhật cuối cùng |
| `deletedAt` | Timestamp | Thời gian xóa (soft delete) |

### 3. Bảng `sentiments` 😊😐😢
**Mục đích**: Phân loại cảm xúc/tâm trạng của tin tức

| Trường | Kiểu dữ liệu | Mô tả |
|--------|-------------|-------|
| `id` | UUID (PK) | Khóa chính |
| `name` | String | Tên cảm xúc (Tích cực, Tiêu cực, Trung tính, v.v.) |
| `createdAt` | Timestamp | Thời gian tạo bản ghi |
| `updatedAt` | Timestamp | Thời gian cập nhật cuối cùng |
| `deletedAt` | Timestamp | Thời gian xóa (soft delete) |

### 4. Bảng `types` 🏷️
**Mục đích**: Phân loại các loại nguồn tin

| Trường | Kiểu dữ liệu | Mô tả |
|--------|-------------|-------|
| `id` | UUID (PK) | Khóa chính |
| `name` | String | Tên loại nguồn (Facebook, Telegram, Website, v.v.) |
| `createdAt` | Timestamp | Thời gian tạo bản ghi |
| `updatedAt` | Timestamp | Thời gian cập nhật cuối cùng |
| `deletedAt` | Timestamp | Thời gian xóa (soft delete) |

## Mối quan hệ (Relationships)

### 1. news → sources (Many-to-One)
- **Khóa ngoại**: `news.sourceId` → `sources.id`
- **Ý nghĩa**: Mỗi bài tin thuộc về một nguồn cụ thể

### 2. news → sentiments (Many-to-One)
- **Khóa ngoại**: `news.sentimentId` → `sentiments.id`
- **Ý nghĩa**: Mỗi bài tin có một cảm xúc/tâm trạng được phân loại

### 3. sources → types (Many-to-One)
- **Khóa ngoại**: `sources.typeId` → `types.id`
- **Ý nghĩa**: Mỗi nguồn tin thuộc về một loại platform cụ thể