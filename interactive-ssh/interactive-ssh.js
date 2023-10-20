module.exports = function(RED) {
    'use strict';

    var host = "";

    // Helper function to attempt connection
    function connect(ssh_client, config) {
        // console.log(`SSH connecting to ${config.username}@${config.host}:${config.port.toString()} with password ${config.pass}`);
        console.log(`Attempting to connect to ${config.host}`);
        // try {
        //     // Make sure the ssh_client passed in isn't being used
        //     ssh_client.end();
        // } catch {}
        try {
            ssh_client.connect(config);
        } catch (e) {
            node.error("ERRCONN", {errMsg: e, host: config.host});
        }
    }

    /* ssh connection */
    function InteractiveSSH(config) {
        RED.nodes.createNode(this, config);

        const debug = true;

        var Client = require('ssh2').Client;
        var conn = new Client();

        const ssh_config = {
            host: config.host,
            port: config.port,
            // keepaliveInterval: 5000,
            username: config.username,
            password: config.pass, // or provide a privateKey
            last: "",
            save: {}
        };
        
        const allowKeepOpen = config.keepOpen;
        const minTimeout = 500;
        const maxTimeout = 1000*60*20; // 20 minutes
        let retryTimeoutID = null;

        let node = this;
	    let retryTimeout = minTimeout;

        conn.on('ready', function() {
            if (debug) console.log('SSH Connected');
	        retryTimeout = minTimeout;
            retryTimeoutID = null;

            node.status({ fill: 'green', shape: 'dot', text: 'connected'});

            conn.shell(function(err, stream) {
                if (err) { 
                    node.error("ERRSHELL", {errMsg: err});
                    conn.end();
                    node.send({ host: ssh_config.host, status: 'error disconnect', last: ssh_config.last, save: ssh_config.save });
                }

                if (debug) console.log('Shell opened');
                node.send({ host: ssh_config.host, status: 'connected', last: ssh_config.last, save: ssh_config.save });

                node.stream = stream

                stream.on('close', function() {
                    node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
                    if (debug) console.log('Stream :: close');
                    node.send({ host: ssh_config.host, status: 'close disconnect', last: ssh_config.last, save: ssh_config.save });
                    // conn.end();
                }).on('error', function(error) {
                    if (debug) console.log('Stream :: error');
                    node.status({ fill: 'red', shape: 'ring', text: 'error' });
                    node.error("ERRSTREAM", {errMsg: error, host: ssh_config.host, last: ssh_config.last, save: ssh_config.save});
                    // conn.end();
                }).on('data', function(data) {
                    node.status({ fill: 'green', shape: 'dot', text: 'connected'});
                    node.send({ host: ssh_config.host, payload: data, last: ssh_config.last, save: ssh_config.save });
                }).stderr.on('data', function(data) {
                    node.status({ fill: 'green', shape: 'dot', text: 'connected'});
                    node.send({ host: ssh_config.host, payload: data, last: ssh_config.last, save: ssh_config.save, "stderr": true });
                });

            });
        });

        conn.on('error', function(e) {
            console.log(`Connection error: ${e.errno} ${e}`);
            node.error(`Connection error`, {errMsg: e, host: ssh_config.host})
            node.status({ fill: 'red', shape: 'ring', text: 'error' });
            conn.end();
        })

        conn.on('close', function() {
            if (debug) console.log('Socket was closed');
            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });

            if (allowKeepOpen) {
                retryTimeout = Math.min(retryTimeout*2, maxTimeout); // Exponential backoff for retrying connection
                if (debug) console.log(`Retrying SSH connection to ${ssh_config.host} in ${retryTimeout/1000} second(s)`)
                
                retryTimeoutID = setTimeout( connect, retryTimeout, conn, ssh_config);
            }
        });

        conn.on('end', function() {
            if (debug) console.log('Socket was disconnected');
            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });

            // if (allowKeepOpen) {
            //     retryTimeout = Math.min(retryTimeout*2, 60000); // Exponential backoff for retrying connection
            //     if (debug) console.log(`Retrying SSH connection to ${ssh_config.host} in ${retryTimeout/1000} second(s)`)
            //     setTimeout( connect, retryTimeout, conn, ssh_config);
            // }
        });

        connect(conn, ssh_config)

        node.on('input', function (msg) {
            const data = msg.payload;
            const save = msg.save;

	    ssh_config.last = data;
	    ssh_config.save = save;	
		
            if (data) {
                if (data.connect == true) {
                    console.log("Requesting manual reconnection")
                    if (retryTimeoutID !== null) {
                        console.log("Attempting manual reconnection")
                        clearTimeout(retryTimeoutID)
                        retryTimeout = minTimeout;
                        retryTimeoutID = setTimeout( connect, retryTimeout, conn, ssh_config);
                        // conn.end()
                    }
                    // retryTimeout = minTimeout


                } else if (data.host ) {
			if (data.host !== ssh_config.host) {
				console.log("Host Change from: " + ssh_config.host + " to: " + data.host);
				
				ssh_config.host     = data.host;
				if (data.username) 
					ssh_config.username  = data.username;
				if (data.password)
					ssh_config.password  = data.password;
				if (data.port)
					ssh_config.port      = data.port;
				if (data.debug) 
					debug = data.debug;
				
				clearTimeout(retryTimeoutID)
				retryTimeout = minTimeout;
				retryTimeoutID = setTimeout( connect, retryTimeout, conn, ssh_config);        
			}

                } else {
                    try {
                        if (node.stream.writable) {
                            node.stream.write(data);

                        } else {
                            console.log("Stream not currently writable. Try again.")
                            node.error("Stream not currently writable. Try again.",{errmsg: "Stream not currently writable. Try again."})
                        }
                    } catch (e) {
                        node.error('Error writing to stream', {errmsg: e})
                    }
                }
            }
            
        });

        node.on('close', function (done) {
            clearTimeout(retryTimeoutID)
            node.stream.removeAllListeners();
            node.stream.end('bye\r\n');
            conn.removeAllListeners();
	        conn.end();
            node.status({});
            done();
        });
    }
    RED.nodes.registerType('interactive-ssh', InteractiveSSH);
};

