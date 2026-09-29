export const QC_GROUPS = [
  { key: 'hardware', label: 'Phần cứng chính', inputs: [['serialNumber','Serial'],['batteryHealth','Pin (%)']], fields: [['mainboard','Mainboard'],['screen','Màn hình'],['keyboard','Bàn phím & đèn bàn phím',['keyboard_backlight']],['touchpad','Touchpad']] },
  { key: 'media', label: 'Camera & âm thanh', fields: [['camera','Camera'],['microphone','Microphone'],['speaker','Loa']] },
  { key: 'connectivity', label: 'Kết nối & cổng', fields: [['wifi','Wi-Fi'],['bluetooth','Bluetooth'],['usb','USB'],['usb_c','USB-C'],['hdmi','HDMI'],['lan','LAN']] },
  { key: 'performance', label: 'Nguồn & hiệu năng', fields: [['ssd_health','Sức khỏe SSD'],['fan','Quạt & tản nhiệt',['cooling']],['cpu_stress','CPU stress'],['gpu_stress','GPU stress'],['charger','Sạc'],['exterior','Ngoại hình']] },
];
export const QC_FIELDS = QC_GROUPS.flatMap(group => group.fields || []);
export const QC_RESULTS = { '': 'Chưa chọn', PASS: 'Đạt', FAIL: 'Không đạt' };
