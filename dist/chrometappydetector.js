(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(["tappy-tcmp","tappy-chromeserialcommunicator","tappy-systemfamily"], factory);
    } else if (typeof exports === 'object') {
        // Node, CommonJS-like
        var tappy = null;
        try {
            tappy = require('@taptrack/tappy');
        }
        catch (e1) {
            tappy = require('tappy');
        }
        
        var chromeSerial = null;
        try {
            chromeSerial = require('@taptrack/tappy-chromeserialcommunicator');
        }
        catch (e1) {
            chromeSerial = require('tappy-chromeserialcommunicator');
        }

        var systemFamily = null;
        try {
            systemFamily = require('@taptrack/tappy-systemfamily');
        }
        catch (e1) {
            systemFamily = require('tappy-systemfamily');
        }
        module.exports = factory(tappy,chromeSerial,systemFamily);
    } else {
        // Browser globals (root is window)
        root.TappyChromeSerialAutodetector = factory(root.Tappy,root.TappyChromeSerialCommunicator,root.TappySystemFamily);
    }
}(this, function (Tappy,Communicator,SystemFamily) {
    var hasParam = function(obj,name) {
        return obj !== null && typeof obj[name] !== 'undefined';
    };

    var getValue = function(obj,name,def) {
        if(hasParam(obj,name)) {
            return obj[name];
        } else {
            return def;
        }
    };

    var chromeSerialWrapper = {
        getDevices: function(cb) {
            chrome.serial.getDevices(cb);
        },
        
        connect: function(path, options, cb) {
            chrome.serial.connect(path,options,cb);
        },
        
        send: function(connectionId, data, cb) {
            chrome.serial.send(connectionId,data,cb);
        },
        
        flush: function(connectionId, cb) {
            chrome.serial.flush(connectionId,db);
        },

        disconnect: function(connectionId, cb) {
            chrome.serial.disconnect(connectionId, cb);
        },
        
        onReceive: {
            addListener: function(cb) {
                chrome.serial.onReceive.addListener(cb);
            }
        }
    };

    var Detector = function(params) {
        var self = this;

        var defaultWait = 100;
        if(typeof params === "undefined" || params === null) {
            this.waitTimeout = defaultWait;
            this.serialWrapper = chromeSerialWrapper;
        } else {
            this.waitTimeout = getValue(params,"waitTimeout",defaultWait);
            this.serialWrapper = getValue(params,"serialWrapper",chromeSerialWrapper);
        }

        this.reportScans = false;
        this.hasReported = false;
        this.lastStatus = false;
        this.cb = function() {};
        this.statusCb = function() {};

        this.internalScanCb = function(devices) {
            var filtered = [];
            for(var i = 0; i < devices.length; i++) {
                var device = devices[i];
                // checking for FTDI vendorID
                if (!!device.vendorId && device.vendorId === 1027) {
                    filtered.push(device);
                }
            }

            if(filtered.length === 0) {
                // so edge listeners detect transition
                self.rawNotifyStatus(true);
                self.notifyStatus(true);
            } else {
                for(var j = 0; j < filtered.length; j++) {
                    if(self.reportScans) {
                        self.handshake(filtered[j]);
                    }
                }
            }
        };

        this.remainingDeviceCheckCount = 0;
    };

    Detector.prototype = {
        createDisconnectTimeout: function(cb) {
            if(this.waitTimeout < 0) {
                //for testing, disable disconnection
                if(this.waitTimeout > -10) {
                    cb();
                }
            }
            else {
                setTimeout(cb,this.waitTimeout);
            }
        },

        handshake: function(device) {
            var self = this;
            // var path = device.path;
            var comm = new Communicator(device.path,{serial: self.serialWrapper});
            var tappy = new Tappy({communicator: comm});
            var msg = new SystemFamily.Commands.Ping();
            var resolver = new SystemFamily.Resolver();
            tappy.setMessageListener(function(msg) {
                var resolvedMsg = null;
                try {
                    resolvedMsg = resolver.resolveResponse(msg);
                } catch (e) {
                    console.log(e);
                }
                if(self.reportScans && resolvedMsg !== null && SystemFamily.Responses.Ping.isTypeOf(resolvedMsg)) {
                    tappy.disconnect(function() {
                        self.cb(device);
                    });
                }
            });
            self.remainingDeviceCheckCount++;
            self.notifyStatus();
            tappy.connect(function(){
                tappy.sendMessage(msg);
            });
            self.createDisconnectTimeout(function() {
                self.remainingDeviceCheckCount--;
                tappy.disconnect();
                if(self.remainingDeviceCheckCount === 0) {
                    self.notifyStatus();
                }
            });
        },

        notifyStatus: function(always) {
            var self = this;
            var currentStatus = self.isScanning();
            if(always || !self.hasReported || currentStatus !== self.lastStatus) {
                self.hasReported = true;
                self.lastStatus = currentStatus;
                self.rawNotifyStatus(currentStatus);
            }
        },

        rawNotifyStatus: function(currentStatus) {
            var self = this;
            self.statusCb(currentStatus);
        },

        scan: function() {
            this.reportScans = true;
            this.serialWrapper.getDevices(this.internalScanCb);
        },

        stop: function() {
            this.reportScans = false;
            this.notifyStatus();
        },

        setCallback: function(cb) {
            this.cb = cb;
        },

        setStatusCallback: function(cb) {
            this.statusCb = cb;
        },

        isScanning: function() {
            return this.reportScans && this.remainingDeviceCheckCount > 0;
        }

    };
    return Detector;
}));
