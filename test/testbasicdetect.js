chrome = {
    runtime: {
        lastError: null
    }
};

var Detector = require('../src/chrometappydetector.js');
var Tappy = require('@taptrack/tappy');
var System = require('@taptrack/tappy-systemfamily');


var MockLoudDevice = function(mockSerial, connectionId) {
    this.disconnected = false;
    var randomBytes = [];
    for(var i = 0; i < (10+Math.floor(Math.random()*20)); i++) {
        randomBytes.push(Math.floor(Math.random*256));
    }

    this.rx = function(data) {
        if(this.disconnected) {
            throw new Error("Trying to send data to a disconnected connection");
        }
        var binData = new Uint8Array(randomBytes);
        mockSerial.rx(connectionId,binData.buffer);
    };

    this.disconnect = function() {
        this.disconnected = true;
    };
};

var MockQuietDevice = function(mockSerial, connectionId) {
    this.disconnected = false;

    this.rx = function(data) {
        if(this.disconnected) {
            throw new Error("Trying to send data to a disconnected connection");
        }
    
    };

    this.disconnect = function() {
        this.disconnected = true;
    };
};

var MockTappyDevice = function(mockSerial, connectionId) {
    this.disconnected = false;

    var VirtTappyCommunicator = function() {
        this.connected = false;
        this.dataCb = function(){};
    };
    VirtTappyCommunicator.prototype = {
        connect: function(){ this.connected = true ;},
        disconnect: function(){this.connected = false;},
        isConnected: function() {return this.connected;},
        flush: function() {},
        send: function(bytes) {
            mockSerial.rx(connectionId,bytes);
        },
        setDataCallback: function(cb) {
            this.dataCb = cb;
        },
        setErrorCallback: function(){},
        forwardData: function(data) {
            this.dataCb(data);
        }
    };

    var virtComm = new VirtTappyCommunicator();
    var virtTappy = new Tappy({communicator: virtComm});
    virtTappy.connect();
    var resolver = new System.Resolver();
    virtTappy.setMessageListener(function(msg) {
        var sendNope = true;
        try {
            var resolved = resolver.resolveCommand(msg);
            if(msg !== null) {
                if(System.Commands.Ping.isTypeOf(resolved)) {
                    sendNope = false;
                    virtTappy.sendMessage(new System.Responses.Ping());
                }
            }
        } catch (e) {
            console.log(e);
        }
        if(sendNope) {
            virtTappy.sendMessage(new System.Responses.SystemError());
        }
    });

    this.rx = function(data) {
        if(this.disconnected) {
            throw new Error("Trying to send data to a disconnected connection");
        } else {
            virtComm.forwardData(data);
        }

    };

    this.disconnect = function() {
        this.disconnected = true;
    };
};

var MockSerial = function(tappyDevices,silentNonTappyDevices,loudNonTappyDevices) {
    var self = this;
    this.tappies = tappyDevices || [];
    this.silentNonTappyDevices = silentNonTappyDevices || [];
    this.loudNonTappyDevices = loudNonTappyDevices || [];
    this.lastGetDeviceCb = function() {};

    this.connections = [];
    this.receiveListeners = [];
    this.onReceive = {};
    this.onReceive.addListener = function(cb) {
        self.receiveListeners.push(cb);
    };
};

MockSerial.prototype = {
    
    getDevices: function(cb) {
        this.lastGetDeviceCb = cb;
        var devices = [];
        for(var tDevice in this.tappies) {
            devices.push({
                path: this.tappies[tDevice],
                vendorId: 1027
            });
        }

        for(var sDevice in this.silentNonTappyDevices) {
            devices.push({
                path: this.silentNonTappyDevices[sDevice],
                vendorId: 1027
            });
        }

        for(var lDevice in this.loudNonTappyDevices) {
            devices.push({
                path: this.loudNonTappyDevices[lDevice],
                vendorId: 1027
            });
        }
        cb(devices);
    },

    resendDevices: function() {
        this.getDevices(this.lastGetDeviceCb);
    },

    connect: function(path, options, cb) {
        var self = this;
        var device = null;
        var length = self.connections.length;
        if(self.tappies.indexOf(path) >= 0) {
            device  = new MockTappyDevice(self,length);
        } else if (self.silentNonTappyDevices.indexOf(path) >= 0) {
            device = new MockQuietDevice(self,length);
        } else if (self.loudNonTappyDevices.indexOf(path) >= 0) {
            device = new MockLoudDevice(self,length);
        } else {
            throw new Error("Cannot connect to a device that doesn't exist");
        }
        if(device !== null) {
            self.connections.push(device);
            cb({connectionId: length});
        }
    },
    
    disconnect: function(connectionId,cb) {
        var self = this;
        if(self.connections.length <= connectionId) {
            throw new Error("Connection doesn't exist");
        }
        else {
            var cnxn = self.connections[connectionId];
            cnxn.disconnect();
            cb(true);
        }
    },

    rx: function(connectionId, data) {
        var self = this;
        for(var i in self.receiveListeners) {
            var listener = self.receiveListeners[i];
            listener({connectionId: connectionId, data: data});
        }
    },

    send: function(connectionId, data, cb) {
        var self = this;
        if(self.connections.length <= connectionId) {
            throw new Error("Connection doesn't exist");
        }
        else {
            var cnxn = self.connections[connectionId];
            cnxn.rx(data);
            cb({});
        }
    },
    
    flush: function(connectionId, cb) {
        // this mock does no buffering so unnecessary
        cb();
    },
    
};

describe("Test scan status",function() {
    it("should report start inactive and become active once scanning initiates",function() {
        var mockSerial = new MockSerial([],[],["/dev/ttyUSB0"]);
        var detector = new Detector({serialWrapper: mockSerial, waitTimeout: -10});
        expect(detector.isScanning()).toBe(false);
        detector.scan();
        expect(detector.isScanning()).toBe(true);
        detector.stop();
        expect(detector.isScanning()).toBe(false);
    });

    it("should report scanning completed once all devices are tested with no devices", function() {
        var mockSerial = new MockSerial();
        var detector = new Detector({serialWrapper: mockSerial, waitTimeout: -1});
        expect(detector.isScanning()).toBe(false);
        detector.scan();
        expect(detector.isScanning()).toBe(false);
    });

    it("should report scanning completed once all devices are tested with many devices", function() {
        var mockSerial = new MockSerial(['/dev/ttyUSB1','COM1'],['/dev/ttyUSB2','COM2'],['/dev/ttyUSB3','COM3']);
        var detector = new Detector({serialWrapper: mockSerial, waitTimeout: -1});
        expect(detector.isScanning()).toBe(false);
        detector.scan();
        expect(detector.isScanning()).toBe(false);
    });
    
});

describe("Test devices forwarded correctly", function() {
    it("should forward all tappy devices detected while scanning",function() {
        var testDevices = [
            "/dev/ttyUSB7",
            "/dev/ttyUSB8",
            "/dev/ttyUSB9",
            "COM7",
            "COM8",
            "COM9"];
        var mockSerial = new MockSerial(testDevices,[],[]);
        var detector = new Detector({serialWrapper: mockSerial, waitTimeout: -1});
        var detectedCount = 0;
        var undetectedDevices = testDevices.slice();
        
        detector.setCallback(function(device) {
            var idx = undetectedDevices.indexOf(device.path);
            expect(idx).not.toEqual(-1);
            undetectedDevices.splice(idx,1);
            detectedCount++;
        });
        detector.scan();
        expect(detectedCount).toBe(6);
        expect(undetectedDevices.length).toBe(0);
    });
    
    it("should not forward devices while not scanning",function() {
        var mockSerial = new MockSerial(["/dev/ttyUSB0"]);
        var detector = new Detector({serialWrapper: mockSerial, waitTimeout: -1});

        detector.scan();
        detector.stop();
        detector.setCallback(function(device) {
            fail("Callback should not be called when scan is stopped");
        });
        mockSerial.resendDevices();
    });

    it("Should not forward silent non-tappy devices", function() {
        var testSilentNonTappies = ["/dev/ttyUSB1","COM3"];
        var mockSerial = new MockSerial([],testSilentNonTappies,[]);
        var detector = new Detector({serialWrapper: mockSerial, waitTimeout: -1});
        detector.setCallback(function(device) {
            fail("Silent non tappy device "+device.path+" was incorrectly forwarded");
        });

        detector.scan();
    });
    
    it("Should not forward loud non-tappy devices", function() {
        var testLoudNonTappies = ["COM4","/dev/ttyUSB2"];
        var mockSerial = new MockSerial([],[],testLoudNonTappies);
        var detector = new Detector({serialWrapper: mockSerial, waitTimeout: -1});
        detector.setCallback(function(device) {
            fail("Loud non tappy device "+device.path+" was incorrectly forwarded");
        });

        detector.scan();

    });
});

