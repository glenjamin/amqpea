/*eslint-env mocha*/

var assert = require('chai').assert;

var shared = require('./shared');

describe("declareExchange", function() {

    var amqp;
    beforeEach(function(done) {
        amqp = shared.createConnection(this, done);
    });

    it("should declare an exchange", function(done) {
        shared.deferCleanup("exchange", "declareExchange-test-a");
        amqp.declareExchange({
            name: "declareExchange-test-a"
        }, function(err) {
            if (err) return done(err);
            shared.adminExchangeInfo("declareExchange-test-a", gotExchange);
        });
        function gotExchange(err, exchange) {
            if (err) return done(err);

            assert.equal(exchange.name, "declareExchange-test-a");

            done();
        }
    });

});
