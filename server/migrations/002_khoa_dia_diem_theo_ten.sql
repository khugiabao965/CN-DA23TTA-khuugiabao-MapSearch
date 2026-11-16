-- Hai địa điểm khác nhau có thể trùng tọa độ (ví dụ một cửa hàng nằm trong tòa nhà),
-- nên khóa địa điểm gồm cả tên: "lat,lon|tên". Phải khớp placeKey ở routes/favorites.js
-- và makeFavKey ở public/js/favorites.js.
UPDATE favorites SET place_key = place_key || '|' || name WHERE instr(place_key, '|') = 0;
