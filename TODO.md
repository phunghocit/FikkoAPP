# TODO - Fix lỗi dự án

- [ ] Thu thập lỗi/build hiện tại (chạy `npm run lint`/`npm run build`) và xác định file gây lỗi.
- [ ] Kiểm tra cấu hình TypeScript/Vite/Tailwind (đảm bảo không có lỗi syntax/typing và cấu hình đúng).
- [ ] Cố định các lỗi có dấu hiệu rõ ràng từ code hiện tại (App.tsx/server.ts) như: typing, props, điều kiện render, import.
- [ ] Chạy lại build + lint sau mỗi cụm thay đổi.
- [x] Tổng hợp thay đổi cuối cùng và hướng dẫn cách chạy dự án.

## Đã làm
- Cập nhật `src/App.tsx` để tránh việc hiển thị `0.0.0.0` sau khi Admin bypass (giữ UX đúng hơn).
- Chạy lại `npm run lint` và `npm run build` đều thành công.


