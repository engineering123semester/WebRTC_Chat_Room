/*******************************************************************
*	Function Name	: webRTC signaling server
*	Description 	: Server which handles the offer and answer request 
********************************************************************/
/* library for websocket */
var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ port: 8886 });
/* to store the connection details */
var users = {};
/* to store the user list details */
var map = new Map();

wss.on('listening', function () {
	console.log("Server started...");
});

wss.on('connection', function (connection) {
	/* Sucessful connection */
	console.log("User has connected");
	connection.on('message', function (message) {

		var isjsonstring = checkisJson(message);

		if(isjsonstring == true)
		{
			var data = JSON.parse(message);	/* Parse the messages from client */
			switch (data.type) {
					/* login request from client */
				case "login":
					/* If anyone login with same user name - refuse the connection */
					if (users[data.name]) {
						/* Already same username has logged in the server */
						/* send response to client back with login failed */
						sendTo(connection, { type: "server_login", success: false });
						console.log("login failed");
	
					} else {
						/* store the connection details */
						users[data.name] = connection;
						connection.name = data.name;
						connection.otherName = null;
						/* store the connection name in the userlist */
						map.set(data.name,'online');
						/* send response to client back with login sucess */
						sendTo(connection, { type: "server_login", success: true });
						console.log("Login sucess");
						/* send updated user lists to all users */
						const obj = Object.fromEntries(map);
	
						for (var i in users) {
							sendUpdatedUserlist(users[i],[...map]);
						}
					}
	
					break;
	
					/* Offer request from client*/
				case "offer":
					/* Check the peer user has logged in the server */
					if (users[data.name]) {
						/* Get the peer connection from array */
						var conn = users[data.name];
						if (conn == null) {
							/* Error handling */
							console.log("connection is null..");
							sendTo(connection, { type: "server_nouser", success: false });
						}
						else if (conn.otherName == null) {
							/* When user is free and availble for the offer */
							/* Send the offer to peer user */
							sendTo(conn, { type: "server_offer", offer: data.offer, name: connection.name });
						}
						else {
							/* User has in the room, User is can't accept the offer */
							sendTo(connection, { type: "server_alreadyinroom", success: true, name: data.name });
						}
					}
					else {
						/* Error handling with invalid query */
						sendTo(connection, { type: "server_nouser", success: false });
					}
	
					break;
	
					/* Answer request from client*/
				case "answer":
					/* Get the peer user connection details */
					var conn = users[data.name];
	
					if (conn != null) {
						/* Send the answer back to requested user */
						sendTo(conn, { type: "server_answer", answer: data.answer });
					}
	
					break;
	
					/* candidate request */
				case "candidate":
					/* Get connection details */
					var conn = users[data.name];
					if (conn != null) {
						/* Send candidate details to user */
						if(conn.otherName != null)
						{
							sendTo(conn, { type: "server_candidate", candidate: data.candidate });
							console.log("candidate sending --");
						}
						
					}
					break;
	
					/* when user want to leave from room */
				case "leave":
					/* Get connection details */
					var conn = users[data.name];
					if (conn != null) {
						/* Send response back to users who are in the room */
						sendTo(conn, { type: "server_userwanttoleave" });
						sendTo(connection, { type: "server_userwanttoleave" });
						map.set(data.name,'online');
						map.set(connection.name,'online');
						/* Update the connection status with available */
						conn.otherName = null;
						connection.otherName = null;
	
						for (var i in users) {
							sendUpdatedUserlist(users[i], [...map]);
						}
						console.log("end room");
					}
	
					break;
	
					/* When user reject the offer */
				case "busy":
					/* Get connection details */
					var conn = users[data.name];
					if (conn != null) {
						/* Send response back to user */
						sendTo(conn, { type: "server_busyuser" });
					}
	
					break;
	
				case "want_to_call":
					var conn = users[data.name];
					if (conn != null) {
						if((conn.otherName != null) && map.get(data.name) == "busy")
						{
							/* User has in the room, User is can't accept the offer */
							sendTo(connection, { type: "server_alreadyinroom", success: true, name: data.name });
						}
						else
						{
							/* User is avilable, User can accept the offer */
							sendTo(connection, { type: "server_alreadyinroom", success: false, name: data.name });
						}
						
					}
					else
					{
						/* Error handling with invalid query */
						sendTo(connection, { type: "server_nouser", success: false });
					}
					break;	
	
					/* Once offer and answer is exchnage, ready for a room */
				case "ready":
					/* Get connection details */
					var conn = users[data.name];
					if (conn != null) {
						/* Update the user status with peer name*/
						connection.otherName = data.name;
						conn.otherName = connection.name;
						map.set(data.name,'busy');
						map.set(connection.name,'busy');
						/* Send response to each users */
						sendTo(conn, { type: "server_userready", success: true, peername: connection.name });
						sendTo(connection, { type: "server_userready", success: true, peername: conn.name });
						/* Send updated user list to all existing users */
						for (var i in users) {
							sendUpdatedUserlist(users[i], [...map]);
						}
					}
	
					break;
	
					/* user quit/signout */
				case "quit":
					/* Get the user details */
					if (data.name) {
						var quit_user = data.name;
						delete users[connection.name];
						map.delete(quit_user);
	
						/* Send updated user list to all existing users */
						for (var i in users) {
							sendUpdatedUserlist(users[i], [...map]);
						}
					}
	
					break;
	
					/* default */
				default:
					sendTo(connection, { type: "server_error", message: "Unrecognized command: " + data.type });
					break;
			}
		}
		else
		{
			console.log("not a json");
			/* ping from client, so repond with pong to get server is alive.*/
			if(message == "clientping")
			{
				console.log("clientping");
				sendTo(connection, { type: "server_pong", name: "pong" });
			}
		}


	});

	/* When socket connection is closed */
	connection.on('close', function () {
		console.log("** leaving **");
		if (connection.name) {
			var quit_user = connection.name;
			/* Remove from the connection */
			delete users[connection.name];
			map.delete(quit_user);

			if (connection.otherName) {
				/* when user is inside the room with peer user */
				var conn = users[connection.otherName];
				if (conn != null) {
					/* Update the details */
					conn.otherName = null;
					connection.otherName = null;
					/* Send the response back to peer user */
					sendTo(conn, { type: "server_exitfrom" });
					map.set(conn.name,'online');
				}
			}

			/* Send the updated userlist to all the existing users  */
			for (var i in users) {
				sendUpdatedUserlist(users[i], [...map]);
			}
		}
	});

});

/* function to send the userlist */
function sendUpdatedUserlist(conn, message) {
	conn.send(JSON.stringify({ type: "server_userlist", name: message }));

}
/* function to send the message */
function sendTo(conn, message) {
	conn.send(JSON.stringify(message));
}
/* function to check the message is JSON or not */
function checkisJson(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}
