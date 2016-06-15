Utility object for detecting TCMP Tappy devices attached to a Chrome packaged
app serial port.

## Installation
NPM
```
npm install @taptrack/tappy-chromeserialautodetector
```
Bower
```
bower install tappy-chromeserialautodetector
```

## Usage
The autodetector works by enumerating the serial devices attached to the
computer then attempting to send each one of them a basic TCMP ping command
and waiting for a valid ping response. For this reason, the autodetector 
should **not** be used if you have serial devices attached to your computer 
such as a serial motor controller that may cause problems when they receive
this command.
```
// Note that by default the autodetector waits 100ms for a response,
// which is generally adequate; however in certain circumstances, such as
// during intensive application initialization, it may be useful to increase the
// wait timeout. This is done by passing the constructor an object containing
// a property called waitTimeout with a value corresponding to the number of
// milliseconds to wait.
var autodetector = new TappyChromeSerialAutodetector({waitTimeout: 250});
var tappy = null;

autodetector.setStatusCallback(function(isScanning) {
    if(isScanning) {
        console.log("Scan started");
    } else {
        console.log("Scan finished");
    }
});

// Callback is passed a chrome.serial device. In general, you will
// only need to pass device.path to a ChromeSerialCommunicator
// for backing a TCMP Tappy object, but there are other parameters
// included that may be of interest
autodetector.setCallback(function(device) {
    autodetector.stop();
    var comm = new TappyChromeSerialCommunicator(device.path);
    tappy = new Tappy({communicator: comm});
    tappy.connect();
});

autodetector.scan();
```
