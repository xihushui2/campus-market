const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ Railway 部署后把 PUBLIC_URL 改成你的实际域名
const PUBLIC_URL = process.env.PUBLIC_URL || ('http://localhost:' + PORT);

// 管理密码（可在 Railway 环境变量中设置 ADMIN_PASS）
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin888';

// ========== Middleware ==========
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== 管理权限验证 ==========
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-pass'] || req.query.pass || '';
  if (pass === ADMIN_PASS) return next();
  res.status(401).json({ error: '管理密码错误' });
}

// ========== 文件上传 (multer) ==========
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'public'),
  filename: function(req, file, cb) {
    var ext = path.extname(file.originalname) || '.png';
    cb(null, 'payment-qr' + ext);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    var allowed = /\.(png|jpg|jpeg|gif|bmp|svg|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('仅支持图片格式'));
    }
  }
});

// ========== 数据路径 ==========
const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const PROOFS_DIR = path.join(DATA_DIR, 'payment-proofs');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROOFS_DIR)) fs.mkdirSync(PROOFS_DIR, { recursive: true });

// ========== 数据读写（带锁防并发损坏） ==========
var writeLocks = {};
function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return null; }
}
function writeJSON(filePath, data) {
  // 先写临时文件再原子替换，防止写一半崩溃
  var tmpFile = filePath + '.tmp.' + Date.now();
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, filePath);
}

// ========== 初始化商品 ==========
function initData() {
  if (!readJSON(PRODUCTS_FILE)) {
    const defaultProducts = [
      { id: 1, name: '校园约拍服务', category: '生活服务', price: 29.9, unit: '次', description: '专业相机 + 学校场景精修9张图，送调色预设。约1小时随拍，适合个人写真、毕业照、情侣照。', image: '📸', seller: '摄影社·小明', contact: 'WeChat: xiaoming_photo', stock: 10, hot: true },
      { id: 2, name: '电脑维修 & 清灰', category: '技术服务', price: 19.9, unit: '台', description: '笔记本清灰、换硅脂、重装系统、C盘清理加速。上门取送，当天完成。', image: '💻', seller: '计算机协会·阿杰', contact: 'WeChat: ajie_pc', stock: 20, hot: true },
      { id: 3, name: '期末复习资料包', category: '学习资料', price: 9.9, unit: '套', description: '高数、大物、线代期末复习笔记 + 历年真题 + 老师划重点整理。电子版，下单秒发。', image: '📚', seller: '学霸·小李', contact: 'QQ: 12345678', stock: 999, hot: true },
      { id: 4, name: '食堂代跑腿', category: '生活服务', price: 3.0, unit: '单', description: '帮你带饭到宿舍楼下，指定食堂+窗口。中午12:00 / 下午5:30两批统一配送。', image: '🍱', seller: '勤工俭学·小张', contact: 'WeChat: zhang_runner', stock: 50, hot: false },
      { id: 5, name: '理发造型上门', category: '生活服务', price: 25.0, unit: '次', description: '在校理发师，男生短发修剪，可到宿舍服务。工具齐全，风格可沟通。', image: '✂️', seller: '美发社·Tony', contact: 'WeChat: tony_school', stock: 30, hot: false },
      { id: 6, name: '校园跑腿代办', category: '生活服务', price: 5.0, unit: '单', description: '取快递、打印文件、交材料、图书馆占座提醒…校内30分钟内响应。', image: '🏃', seller: '跑腿小队·小刘', contact: 'WeChat: liu_runner', stock: 100, hot: false },
      { id: 7, name: '简历精修服务', category: '学习资料', price: 15.0, unit: '份', description: 'HR学姐亲自修改简历，优化排版和话术，附赠面试常见问题清单。适合实习/校招。', image: '🎓', seller: '职协·学姐小周', contact: 'WeChat: zhou_hr', stock: 15, hot: false },
      { id: 8, name: '吉他/尤克里里教学', category: '兴趣培训', price: 39.9, unit: '课时', description: '零基础入门，45分钟/课时，一对一教学。可借练习琴，学完能弹唱3-5首歌。', image: '🎸', seller: '音乐社·阿豪', contact: 'WeChat: hao_music', stock: 8, hot: true },
      { id: 9, name: '宿舍深度清洁', category: '生活服务', price: 35.0, unit: '次', description: '全宿舍清洁+垃圾打包+物品归纳。2小时内搞定，提供清洁工具。4人间以下不加价。', image: '🧹', seller: '清洁达人·小王', contact: 'WeChat: wang_clean', stock: 5, hot: false },
      { id: 10, name: '二手教材回收转卖', category: '闲置交易', price: 12.0, unit: '本', description: '回收各专业旧教材，低价转卖给学弟学妹。比学校书店便宜60%+，成色好可用。', image: '📦', seller: '书店·老刘', contact: 'WeChat: laoliu_book', stock: 200, hot: false }
    ];
    writeJSON(PRODUCTS_FILE, defaultProducts);
  }
  if (!readJSON(ORDERS_FILE)) { writeJSON(ORDERS_FILE, []); }
}

// ========== 收款码查找 ==========
function findPaymentQR() {
  var exts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'];
  for (var i = 0; i < exts.length; i++) {
    var p = path.join(__dirname, 'public', 'payment-qr' + exts[i]);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ========== API ==========

// 状态
app.get('/api/status', (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const orders = readJSON(ORDERS_FILE) || [];
  res.json({
    ok: true,
    publicURL: PUBLIC_URL,
    port: PORT,
    productCount: products.length,
    orderCount: orders.length
  });
});

// 二维码
app.get('/api/qrcode', async (req, res) => {
  const targetURL = req.query.url || PUBLIC_URL;
  try {
    const qrDataURL = await QRCode.toDataURL(targetURL, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.json({ ok: true, url: targetURL, qr: qrDataURL });
  } catch (e) { res.status(500).json({ error: 'QR 生成失败' }); }
});

// 商品列表
app.get('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const { category, search, sort } = req.query;
  let result = [...products];
  if (category && category !== '全部') result = result.filter(p => p.category === category);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.seller.toLowerCase().includes(q));
  }
  if (sort === 'price-asc') result.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') result.sort((a, b) => b.price - a.price);
  else if (sort === 'hot') result.sort((a, b) => (b.hot ? 1 : 0) - (a.hot ? 1 : 0));
  res.json(result);
});

// 商品详情
app.get('/api/products/:id', (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: '商品不存在' });
  res.json(product);
});

// 下单
app.post('/api/orders', (req, res) => {
  const { items, buyer, contact, note } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: '购物车不能为空' });
  if (!buyer) return res.status(400).json({ error: '请填写你的姓名' });
  const products = readJSON(PRODUCTS_FILE) || [];
  const orders = readJSON(ORDERS_FILE) || [];
  let total = 0;
  const orderItems = [];
  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    if (!product) continue;
    const qty = Math.min(item.quantity || 1, product.stock);
    orderItems.push({ productId: product.id, name: product.name, price: product.price, quantity: qty, seller: product.seller });
    total += product.price * qty;
    product.stock = Math.max(0, product.stock - qty);
  }
  const order = {
    id: Date.now(), items: orderItems, buyer, contact, note: note || '',
    total: Math.round(total * 100) / 100, status: 'pending',
    proofImage: req.body.proofImage || null, createdAt: new Date().toISOString()
  };
  orders.push(order);
  writeJSON(ORDERS_FILE, orders);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ success: true, order });
});

// 订单列表
app.get('/api/orders', (req, res) => {
  const orders = readJSON(ORDERS_FILE) || [];
  res.json(orders);
});

// 收款码图片
app.get('/api/payment-qr', (req, res) => {
  var qrFile = findPaymentQR();
  if (qrFile) {
    var ext = path.extname(qrFile).toLowerCase();
    var mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mimeMap[ext] || 'image/png');
    return res.sendFile(qrFile);
  }
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send('<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280"><rect width="280" height="280" fill="#f9fafb" rx="12" stroke="#e5e7eb" stroke-width="2"/><text x="140" y="130" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#9ca3af">尚未上传收款码</text><text x="140" y="155" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#d1d5db">在管理后台→收款码设置中上传</text></svg>');
});

// 收款码状态
app.get('/api/payment-status', (req, res) => {
  res.json({ ready: !!findPaymentQR(), file: findPaymentQR() ? path.basename(findPaymentQR()) : null });
});

// 上传收款码
app.post('/api/admin/payment-qr', adminAuth, upload.single('qrfile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择收款码图片' });
  var exts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'];
  exts.forEach(function(ext) {
    var oldFile = path.join(__dirname, 'public', 'payment-qr' + ext);
    if (fs.existsSync(oldFile) && oldFile !== req.file.path) {
      try { fs.unlinkSync(oldFile); } catch(e) {}
    }
  });
  res.json({ ok: true, message: '收款码已上传', fileName: req.file.filename });
});

// 删除收款码
app.delete('/api/admin/payment-qr', adminAuth, (req, res) => {
  var qrFile = findPaymentQR();
  if (qrFile) { try { fs.unlinkSync(qrFile); } catch(e) {} }
  res.json({ ok: true, message: '收款码已删除' });
});

// 上传付款截图
app.post('/api/payment-proof/:orderId', upload.single('proof'), (req, res) => {
  var orders = readJSON(ORDERS_FILE) || [];
  var order = orders.find(function(o) { return o.id === parseInt(req.params.orderId); });
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (!req.file) return res.status(400).json({ error: '请选择付款截图' });
  var ext = path.extname(req.file.originalname) || '.png';
  var proofFileName = 'proof-' + order.id + '-' + Date.now() + ext;
  var proofPath = path.join(PROOFS_DIR, proofFileName);
  fs.renameSync(req.file.path, proofPath);
  order.proofImage = '/api/proof/' + proofFileName;
  order.proofUploadedAt = new Date().toISOString();
  writeJSON(ORDERS_FILE, orders);
  res.json({ ok: true, message: '付款截图已上传', order: order });
});

// 获取付款截图
app.get('/api/proof/:fileName', (req, res) => {
  var f = path.join(PROOFS_DIR, req.params.fileName);
  if (!fs.existsSync(f)) return res.status(404).send('截图不存在');
  var ext = path.extname(f).toLowerCase();
  var mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  res.setHeader('Content-Type', mimeMap[ext] || 'image/png');
  res.sendFile(f);
});

// ============================================================
//  管理 API (需要密码)
// ============================================================

// 登录
app.post('/api/admin/login', (req, res) => {
  if (req.body.pass === ADMIN_PASS) {
    res.json({ ok: true, token: ADMIN_PASS });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

// 新增商品
app.post('/api/admin/products', adminAuth, (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const { name, category, price, unit, description, image, seller, contact, stock, hot } = req.body;
  if (!name || !category || price == null) {
    return res.status(400).json({ error: '名称、分类、价格 必填' });
  }
  const maxId = products.reduce((m, p) => Math.max(m, p.id), 0);
  const product = {
    id: maxId + 1, name, category, price: Number(price), unit: unit || '次',
    description: description || '', image: image || '📦', seller: seller || '',
    contact: contact || '', stock: Number(stock) || 0, hot: !!hot
  };
  products.push(product);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, product });
});

// 修改商品
app.put('/api/admin/products/:id', adminAuth, (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const idx = products.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '商品不存在' });
  const updates = req.body;
  delete updates.id;
  Object.assign(products[idx], updates);
  if (updates.price !== undefined) products[idx].price = Number(updates.price);
  if (updates.stock !== undefined) products[idx].stock = Number(updates.stock);
  if (updates.hot !== undefined) products[idx].hot = !!updates.hot;
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, product: products[idx] });
});

// 删除商品
app.delete('/api/admin/products/:id', adminAuth, (req, res) => {
  let products = readJSON(PRODUCTS_FILE) || [];
  const exists = products.find(p => p.id === parseInt(req.params.id));
  if (!exists) return res.status(404).json({ error: '商品不存在' });
  products = products.filter(p => p.id !== parseInt(req.params.id));
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, deleted: exists });
});

// 修改订单状态
app.patch('/api/orders/:id', (req, res) => {
  const orders = readJSON(ORDERS_FILE) || [];
  const order = orders.find(o => o.id === parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (req.body.status) order.status = req.body.status;
  if (req.body.note !== undefined) order.note = req.body.note;
  writeJSON(ORDERS_FILE, orders);
  res.json({ success: true, order });
});

// 删除订单
app.delete('/api/admin/orders/:id', adminAuth, (req, res) => {
  let orders = readJSON(ORDERS_FILE) || [];
  const exists = orders.find(o => o.id === parseInt(req.params.id));
  if (!exists) return res.status(404).json({ error: '订单不存在' });
  orders = orders.filter(o => o.id !== parseInt(req.params.id));
  writeJSON(ORDERS_FILE, orders);
  res.json({ ok: true, deleted: exists });
});

// 清空订单
app.delete('/api/admin/orders', adminAuth, (req, res) => {
  writeJSON(ORDERS_FILE, []);
  res.json({ ok: true });
});

// 重置数据
app.post('/api/admin/reset', adminAuth, (req, res) => {
  try { fs.unlinkSync(PRODUCTS_FILE); } catch {}
  try { fs.unlinkSync(ORDERS_FILE); } catch {}
  initData();
  res.json({ ok: true, message: '数据已重置' });
});

// 管理后台
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== 启动 ==========
initData();

app.listen(PORT, '0.0.0.0', () => {
  console.log('🎓 校园经济平台已启动 端口: ' + PORT + ' 管理密码: ' + ADMIN_PASS);
});
