/*eslint-env mocha*/
var urllib = require('url');
var net = require('net');

var async = require('async');

var amqpea = require('..');

var login = process.env.AMQP_USERNAME || "guest";
var password = process.env.AMQP_PASSWORD || "guest";
var hostname = process.env.AMQP_HOSTNAME || "localhost";
var port = parseInt(process.env.AMQP_PORT, 10) || 5672;
var vhost = process.env.AMQP_VHOST || "/";
var admin = parseInt(process.env.AMQP_ADMIN_PORT, 10) || 15672;

var uriData = {
    protocol: 'amqp',
    slashes: true,
    auth: encodeURIComponent(login) + ':' + encodeURIComponent(password),
    hostname: hostname,
    port: port,
    pathname: encodeURIComponent(vhost)
};

var uri = exports.uri = urllib.format(uriData);
exports.brokenUri = urllib.format(
    copy(uriData, { hostname: 'amqp.example.com' }));
exports.brokenUri2 = urllib.format(
    copy(uriData, { hostname: 'amqp.example.org' }));

// Ensure we can connect at all before starting tests
before(function checkConnectivity(done) {
    async.map([port, admin], async.apply(testConnection, hostname), done);
});
function testConnection(hostname, port, callback) {
    var socket = net.connect({host: hostname, port: port});
    socket.on('connect', function() {
        socket.end();
        callback();
    });
    socket.on('error', callback);
}

// Shorthand factory for connection related to test
exports.createConnection = function(context, callback) {
    var name = context.currentTest.fullTitle();
    var amqp = amqpea(uri, { timeout: 50, client: { product: name } });
    amqp.on('error', callback);
    amqp.on('ready', function() {
        amqp.removeListener('error', callback);
        callback();
    });
    exports.deferCleanup(amqp);
    return amqp;
};

// Ensure server state is cleared down between tests
var items = [];
var connections = [];
exports.deferCleanup = function deferCleanup(type, object) {
    if (typeof object === 'undefined') {
        object = type;
        type = 'connection';
    }
    switch(type) {
        case 'connection':
            object.on('ready', function() {
                connections.push(object);
            });
            break;
        case 'exchange':
            items.push(['exchange', object]);
            break;
    }
};
afterEach(function closeConnections(done) {
    async.each(connections, function(amqp, next) {
        amqp.close(next);
    }, done);
    connections = [];
});
afterEach(function deleteItems(done) {
    async.each(items, function(item, next) {
        var type = item[0], name = item[1];
        exports.admin({
            method: 'DELETE',
            path: "/" + type + "s/" + encodeURIComponent(vhost) + "/" + name
        }, next);
    }, done);
    connections = [];
});

// Helpers for talking to the admin API
var client = require('request');
exports.admin = function(options, callback) {
    if (typeof options === 'string') {
        options = { path: options };
    }
    client(copy({
        uri: urllib.format({
            protocol: "http",
            hostname: hostname,
            port: admin,
            pathname: "/api" + options.path
        }),
        json: true,
        auth: { username: login, password: password }
    }, options), function(err, res, body) {
        err = err || res.statusCode >= 400 &&
            new Error('' + res.statusCode + ': ' + body);
        callback(err, body, res);
    });
};
exports.adminConnectionInfo = function (amqp, callback) {
    var outgoingPort = amqp.socket.localPort;
    exports.admin("/connections", function(err, connections) {
        if (err) return callback(err);

        var connection = connections.filter(function(conn) {
            return conn.peer_port == outgoingPort;
        })[0];

        if (!connection) return callback(new Error('Connection not found'));

        callback(null, connection);
    });
};

function copy(a, b) {
    var result = {};
    Object.keys(a).forEach(function(k) { result[k] = a[k]; });
    Object.keys(b).forEach(function(k) { result[k] = b[k]; });
    return result;
}
