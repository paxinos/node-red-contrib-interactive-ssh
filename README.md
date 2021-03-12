# node-red-contrib-interactive-ssh

## How to use
This is still very much in development. It was mostly created for a specific use case and may not work in all circumstances. 

By checking the `Keep Open` box, it will attempt to reconnect to the SSH host if the connection is lost using an exponential backoff of up to 20 minutes.
You can use a Catch node to see what errors are thrown from the SSH node that aren't already being caught and handled.

**Keep in mind that the SSH password is saved in plain text in your Node-RED config directory**

Future work will add the ability to use an SSH key file.

### Input
`msg.payload <string>` = The command that you wish to be sent to the remote shell

### Output
`msg.payload <string>` = The text printed to STDOUT on the remote shell
`msg.host` = The IP address of the connected host. This is also returned on errors so can be used in conjunction with the Catch node so only one Catch node is needed to watch all uses of the Interactive SSH node.
