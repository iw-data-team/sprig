# Cấu hình cloud cho Sprig

Tài liệu này giúp bật đăng nhập Google và lưu mindmap lên Supabase Free cho trang [iw-data-team.github.io/sprig](https://iw-data-team.github.io/sprig/). Khi chưa cấu hình Supabase, ứng dụng vẫn chạy ở chế độ khách và lưu dữ liệu trên trình duyệt.

## Mô hình dữ liệu và quyền

Sprig dùng một project Supabase PostgreSQL chung. Mỗi mindmap có `owner_id`, và PostgreSQL Row Level Security (RLS) giới hạn tài khoản chỉ đọc được map của mình hoặc map được chia sẻ với tài khoản đó. Đây là dữ liệu riêng theo hàng trong database, không phải một database PostgreSQL vật lý riêng cho từng tài khoản.

Chia sẻ được gán theo email Google đã xác minh: `viewer` chỉ xem; `editor` được chỉnh nội dung. Chỉ chủ sở hữu được mời, đổi vai trò hoặc thu hồi quyền. Các thao tác ghi đi qua RPC có kiểm tra quyền và `version`, còn client không dùng khóa service-role. Khi hai người cùng sửa, phiên bản cũ bị từ chối để tránh ghi đè âm thầm; ứng dụng giữ bản nháp để người dùng mở map cloud hoặc lưu thành bản sao. Bản đầu chưa hợp nhất thay đổi đồng thời theo thời gian thực.

## 1. Tạo Supabase Free và chạy schema

1. Tạo project ở [Supabase](https://supabase.com/dashboard), chọn gói Free, đặt tên tùy ý (ví dụ `sprig`) và chọn region gần Việt Nam như Singapore. Lưu project password trong trình quản lý mật khẩu; ứng dụng không cần mật khẩu này.
2. Mở **SQL Editor → New query**, sao chép toàn bộ nội dung [`supabase/migrations/202610300001_cloud.sql`](../supabase/migrations/202610300001_cloud.sql), chạy và xác nhận thành công. Migration tạo bảng, RLS và các RPC cần thiết. Kiểm thử phân quyền chạy riêng bằng `npm test` trên PostgreSQL nhúng (PGlite), không chèn tài khoản hay dữ liệu thử vào production.
3. Vào **Project Settings → API** (tên mục có thể được cập nhật thành **API Keys**). Lấy **Project URL** và **publishable key** (`sb_publishable_...`; project cũ có thể hiển thị `anon` key). Không lấy hoặc đưa `service_role`/`secret` key vào trình duyệt, GitHub, hoặc tài liệu công khai.

## 2. Bật Google OAuth

1. Trong [Google Cloud Console](https://console.cloud.google.com/), tạo/chọn project, cấu hình **Google Auth Platform → Branding** và loại người dùng phù hợp. Với **External** ở trạng thái **Testing**, thêm địa chỉ Google của bạn và những người thử nghiệm vào **Test users**. Để người dùng bất kỳ đăng nhập được, hoàn tất yêu cầu của Google và chuyển ứng dụng sang **In production**; Google có thể yêu cầu xác minh tùy phạm vi và cấu hình.
2. Tạo **OAuth client ID → Web application**. Đặt Authorized JavaScript origin là `https://iw-data-team.github.io`.
3. Thêm Authorized redirect URI chính xác theo project Supabase: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. Thay `YOUR_PROJECT_REF` bằng phần ref trong Project URL. Đây là callback của Supabase, không phải URL GitHub Pages.
4. Sao chép Client ID và Client secret. Trong Supabase mở **Authentication → Providers → Google**, bật provider và nhập hai giá trị đó. Client secret chỉ nhập vào dashboard Supabase; không đưa vào Sprig hoặc GitHub.
5. Trong Supabase **Authentication → URL Configuration**, đặt Site URL là `https://iw-data-team.github.io/sprig/` và thêm URL này vào Redirect URLs. URL wildcard preview chỉ thêm khi thực sự cần, nên giới hạn theo domain/đường dẫn của bạn.

Các URL cần phân biệt:

| Mục | Giá trị |
| --- | --- |
| Trang Sprig | `https://iw-data-team.github.io/sprig/` |
| Google Authorized JavaScript origin | `https://iw-data-team.github.io` |
| Google Authorized redirect URI | `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` |
| Supabase Site URL và Sprig redirect URL | `https://iw-data-team.github.io/sprig/` |

## 3. Cấu hình deploy GitHub Pages

Trong GitHub repository `iw-data-team/sprig`, mở **Settings → Secrets and variables → Actions → Variables** và tạo hai Repository variables:

| Tên | Giá trị |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL, ví dụ `https://YOUR_PROJECT_REF.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key của Supabase (`sb_publishable_...`) |

Đây là giá trị public được nhúng vào web client; quyền truy cập được bảo vệ bởi RLS. Không tạo biến `service_role` hay OAuth secret. Workflow đọc hai biến khi build. Sau khi lưu, chạy **Actions → Deploy Sprig to GitHub Pages → Run workflow**; các push mới lên `main` cũng deploy tự động.

Để chạy local, sao chép `.env.example` thành `.env.local`, điền cùng Project URL và publishable key, rồi chạy `npm run dev`. `.env.local` bị loại khỏi Git.

## 4. Kiểm tra

1. Mở trang production bằng cửa sổ riêng tư, đăng nhập Google và tạo map. Reload trang: map phải còn trong danh sách.
2. Với map khác, mời email của tài khoản Google thứ hai ở quyền `viewer`. Đăng nhập bằng tài khoản đó: map xem được nhưng thao tác chỉnh sửa bị khóa.
3. Đổi vai trò thành `editor`, reload tài khoản thứ hai và thử sửa. Thu hồi quyền rồi kiểm tra tài khoản thứ hai không còn truy cập được.
4. Thử đăng nhập bằng tài khoản ngoài Google Test users khi consent screen còn ở Testing; Google sẽ chặn tài khoản đó. Muốn mở cho mọi người, xuất bản consent screen theo yêu cầu Google.

## Giới hạn gói Free

Supabase Free hiện công bố hạn mức 500 MB database, 50.000 monthly active users và 5 GB egress; project Free có thể bị pause sau một tuần không hoạt động. Hạn mức và chính sách có thể thay đổi, xem [bảng giá Supabase](https://supabase.com/pricing) trước khi mở rộng cho nhiều người dùng. Khi project bị pause, đăng nhập và đồng bộ cloud sẽ tạm ngừng cho đến khi resume; bản nháp trên trình duyệt vẫn hữu ích để khôi phục nội dung.

Tài liệu tham khảo: [Google login với Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Postgres RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
