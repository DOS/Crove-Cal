# Interactive Next Dev Tasks Selection Rule

Sau khi hoàn thành bất kỳ task nào hoặc khi báo cáo kết quả:
1. **Đề xuất Next Dev Tasks**: Chủ động phân tích và liệt kê danh sách các task phát triển kế tiếp (Next Dev Tasks) kèm mục tiêu và phạm vi kỹ thuật rõ ràng.
2. **Bắt buộc dùng Popup Multi-Select (`AskQuestion`)**:
   - Gọi tool `AskQuestion` với `allow_multiple: true` để tạo form popup có checkbox/options tương ứng với từng task được đề xuất.
   - Không chỉ ghi số/chữ trong văn bản để user gõ lại (tránh nhầm lẫn, lệch ngữ cảnh giữa các phiên chat).
   - Cho phép user chọn một hoặc nhiều task cùng lúc thông qua popup native UI.
