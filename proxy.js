// ==========================================
//  校园经济平台 — 反向代理
//  功能: localhost:3000 → Railway 远程服务器
//  这样 serveo 隧道始终指向 Railway
// ==========================================

var http = require('http');
var https = require('https');
var url = require('url');

var TARGET = process.env.TARGET_URL || 'https://optimistic-curiosity-production-5452.up.railway.app';
var PORT = process.env.PORT || 3000;

var parsedTarget = url.parse(TARGET);
var isHttps = parsedTarget.protocol === 'https:';

var agent = isHttps ? new https.Agent({ keepAlive: true, maxSockets: 20 }) : new http.Agent({ keepAlive: true, maxSockets: 20 });

function proxyRequest(clientReq, clientRes) {
  var options = {
    hostname: parsedTarget.hostname,
    port: parsedTarget.port || (isHttps ? 443 : 80),
    path: clientReq.url,
    method: clientReq.method,
    headers: Object.assign({}, clientReq.headers, { host: parsedTarget.hostname, 'x-forwarded-for': clientReq.socket.remoteAddress || '127.0.0.1', 'x-forwarded-proto': 'https' }),
    agent: agent,
    timeout: 30000
  };

  var proxyReq = (isHttps ? https : http).request(options, function(proxyRes) {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', function(err) {
    console.error('[proxy error] ' + err.message);
    clientRes.writeHead(502);
    clientRes.end('Proxy Error: ' + err.message);
  });

  proxyReq.on('timeout', function() {
    proxyReq.abort();
    clientRes.writeHead(504);
    clientRes.end('Gateway Timeout');
  });

  clientReq.pipe(proxyReq);
}

var server = http.createServer(proxyRequest);

server.listen(PORT, '127.0.0.1', function() {
  console.log('🔁 反向代理已启动: http://localhost:' + PORT + ' → ' + TARGET);
});

// 保活 self-check
setInterval(function() {
  https.get(TARGET + '/api/status', function(res) {
    var body = '';
    res.on('data', function(c) { body += c; });
    res.on('end', function() {
      if (res.statusCode === 200) {
        var d = JSON.parse(body);
        console.log('✅ Railway OK | 商品:' + d.productCount + ' | 订单:' + d.orderCount);
      }
    });
  }).on('error', function() { console.error('❌ Railway 不可达'); });
}, 60000);
