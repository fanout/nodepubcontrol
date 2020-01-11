import assert from "assert";

import Item from '../src/data/Item.mjs';
import Format from '../src/data/Format.mjs';
import PubControlClient from "../src/engine/PubControlClient.mjs";
import PublishException from "../src/data/PublishException.mjs";

class TestFormat extends Format {
    body;
    constructor(body) {
        super();
        this.body = body;
    }
    name() {
        return 'testformat';
    }
    export() {
        return { body: this.body };
    }
}

(function testInitialize() {
    const pcc = new PubControlClient("uri");
    assert.equal(pcc.uri, "uri");
    assert.equal(pcc.auth, null);
    assert.notEqual(pcc.httpKeepAliveAgent, null);
    assert.notEqual(pcc.httpsKeepAliveAgent, null);
})();

(function testSetAuthBasic() {
    const pcc = new PubControlClient("uri");
    pcc.setAuthBasic("user", "pass");
    assert.equal(pcc.auth.user, "user");
    assert.equal(pcc.auth.pass, "pass");
})();

(function testSetAuthJwt() {
    let pcc = new PubControlClient("uri");
    pcc.setAuthJwt("claim", "key");
    assert.equal(pcc.auth.claim, "claim");
    assert.equal(pcc.auth.key, "key");
    pcc = new PubControlClient("uri");
    pcc.setAuthJwt("token");
    assert.equal(pcc.auth.token, "token");
})();

(async function testPublish() {
    let wasWorkerCalled = false;
    const itm = new Item(new TestFormat("bodyval", "id", "prev-id"));
    const exportedItem = itm.export();
    exportedItem["channel"] = "channel";
    const pcc = new PubControlClient("uri");
    pcc._startPubCall = async function(uri, authHeader, items) {
        assert.equal(uri, "uri");
        assert.equal(
            authHeader,
            "Basic " + Buffer.from("user:pass").toString("base64")
        );
        assert.equal(JSON.stringify(items), JSON.stringify([exportedItem]));
        wasWorkerCalled = true;
    };
    pcc.setAuthBasic("user", "pass");
    await pcc.publish("channel", itm);
    assert(wasWorkerCalled);
})();

(async function testPublishNoAuth() {
    let wasWorkerCalled = false;
    const itm = new Item(new TestFormat("bodyval", "id", "prev-id"));
    const exportedItem = itm.export();
    exportedItem["channel"] = "channel";
    const pcc = new PubControlClient("uri");
    pcc._startPubCall = async function(uri, authHeader, items) {
        assert.equal(uri, "uri");
        assert.equal(authHeader, null);
        assert.equal(JSON.stringify(items), JSON.stringify([exportedItem]));
        wasWorkerCalled = true;
    };
    await pcc.publish("channel", itm);
    assert(wasWorkerCalled);
})();

(async function testPublishFail() {
    const itm = new Item(new TestFormat("bodyval", "id", "prev-id"));
    const exportedItem = itm.export();
    exportedItem["channel"] = "channel";
    const pcc = new PubControlClient("uri");
    pcc._startPubCall = async function(uri, authHeader, items) {
        throw new PublishException('fail', null);
    };
    let resultEx = null;
    await assert.rejects(async () => {
        await pcc.publish("channel", itm);
    }, ex => {
        resultEx = ex;
        return true;
    });
    assert(resultEx instanceof PublishException);
    assert.strictEqual(resultEx.message, "fail");
})();

(async function testStartPubCall() {
    const pcc = new PubControlClient("http://uri.com");
    let wasPerformHttpRequestCalled = false;
    pcc._performHttpRequest = async function(transport, uri, reqParams) {
        assert.equal(reqParams.body, JSON.stringify({ items: "items" }));
        assert.equal(reqParams.method, "POST");
        assert.equal(reqParams.headers["Content-Type"], "application/json");
        assert.equal(
            reqParams.headers["Content-Length"],
            Buffer.byteLength(reqParams.body, "utf8")
        );
        assert.equal(reqParams.headers["Authorization"], "authHeader");
        assert.equal(uri, "http://uri.com/publish/");
        assert.equal(pcc.httpKeepAliveAgent, reqParams.agent);
        wasPerformHttpRequestCalled = true;
    };
    await pcc._startPubCall("http://uri.com", "authHeader", "items");
    assert(wasPerformHttpRequestCalled);
})();

(async function testStartPubCallHttps() {
    const pcc = new PubControlClient("https://uri.com");
    let wasPerformHttpRequestCalled = false;
    pcc._performHttpRequest = async function(transport, uri, reqParams) {
        assert.equal(reqParams.body, JSON.stringify({ items: "items" }));
        assert.equal(reqParams.method, "POST");
        assert.equal(reqParams.headers["Content-Type"], "application/json");
        assert.equal(
            reqParams.headers["Content-Length"],
            Buffer.byteLength(reqParams.body, "utf8")
        );
        assert(!("Authorization" in reqParams.headers));
        assert.equal(uri, "https://uri.com/publish/");
        assert.equal(pcc.httpsKeepAliveAgent, reqParams.agent);
        wasPerformHttpRequestCalled = true;
    };
    await pcc._startPubCall("https://uri.com", null, "items");
    assert(wasPerformHttpRequestCalled);
})();

(async function testStartPubCallBadUri() {
    const pcc = new PubControlClient("https://uri.com");
    let resultEx = null;
    await assert.rejects(async () => {
        await pcc._startPubCall("file://uri.com", null, "items");
    }, ex => {
        resultEx = ex;
        return true;
    });
    assert(resultEx instanceof PublishException);
    assert.equal(resultEx.message, "Bad URI");
    assert.equal(resultEx.context.statusCode, -2);
})();

(function testFinishHttpRequest() {
    const pcc = new PubControlClient("https://uri.com");
    assert.doesNotThrow(() => {
        pcc._finishHttpRequest(
            "end",
            ["result"],
            { statusCode: 200 }
        );
    });
})();

(function testFinishHttpRequestFailure() {
    const pcc = new PubControlClient("https://uri.com");
    let resultEx = null;
    assert.throws(() => {
        pcc._finishHttpRequest( "end", "result", { statusCode: 300 } );
    }, ex => {
        resultEx = ex;
        return true;
    });
    assert.ok(resultEx instanceof PublishException);
    assert.equal(resultEx.message, '\"result\"');
    assert.equal(resultEx.context.statusCode, 300);
})();

(function testFinishHttpRequestClose() {
    const pcc = new PubControlClient("https://uri.com");
    let resultEx = null;
    assert.throws(() => {
        pcc._finishHttpRequest( "close", "result", { statusCode: 300 } );
    }, ex => {
        resultEx = ex;
        return true;
    });
    assert.ok(resultEx instanceof PublishException);
    assert.equal(resultEx.message, 'Connection closed unexpectedly');
    assert.equal(resultEx.context.statusCode, 300);
})();

(async function testPerformHttpRequest() {
    let wasFinishHttpRequestCalled = false;
    let wasFinishHttpRequestCalledForClose = false;
    const pcc = new PubControlClient("https://uri.com");

    pcc._finishHttpRequest = (mode, httpData, context) => {
        wasFinishHttpRequestCalled = false;
        wasFinishHttpRequestCalledForClose = false;
        if (mode === "end") {
            wasFinishHttpRequestCalled = true;
            assert.equal(httpData, "result");
        }
        if (mode === "close") {
            wasFinishHttpRequestCalledForClose = true;
        }
    };

    const failTransport = async (uri, opts) => {
        assert.equal(opts.body, "content");
        throw { message: "message" };
    };

    let resultEx = null;
    await assert.rejects(async () => {
        await pcc._performHttpRequest(failTransport, "https://uri.com/publish/", {
            body: "content"
        });
    }, ex => {
        resultEx = ex;
        return true;
    });
    assert.ok(resultEx instanceof PublishException);
    assert.equal(resultEx.message, "message");
    assert.equal(resultEx.context.statusCode, -1);
    assert(!wasFinishHttpRequestCalled);
    assert(!wasFinishHttpRequestCalledForClose);

    const closeTransport = async (uri, opts) => {
        assert.equal(opts.body, "content");
        return {
            status: 200,
            headers: {},
            text: async () => {
                throw "error";
            },
        };
    };

    await pcc._performHttpRequest(closeTransport, "https://uri.com/publish/", {
        body: "content"
    });
    assert(!wasFinishHttpRequestCalled);
    assert(wasFinishHttpRequestCalledForClose);

    const successTransport = async (uri, opts) => {
        assert.equal(opts.body, "content");
        return {
            status: 200,
            headers: {},
            text: async () => {
                return "result";
            },
        };
    };

    await pcc._performHttpRequest(successTransport, "https://uri.com/publish/", {
        body: "content"
    });
    assert(wasFinishHttpRequestCalled);
    assert(!wasFinishHttpRequestCalledForClose);
})();
