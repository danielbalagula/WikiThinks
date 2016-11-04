var g;
var svg;
var inner;
var zoom;

var currentDiscussionId;
var currentResponse;

var fetchedResponses = [];

var responseColors = {
	'subordinate': '#4286f4',
	'concur' : '#7af442',
	'dissent' : '#1d00ff',
	'requestForClarification' : '#d8d147',
	'rejectPreviousArgumentType' : '#ef0000',
	'requestForFactualSubstantiation' : '#848484'
}

var argumentsToRespondTo = []; //an array of arguments the user is planning to respond to simultaneously

$(document).ready(function() {
	
	var currentDiscussionId = $( ".discussionId" ).attr('id');

	var g = new dagreD3.graphlib.Graph()
		.setGraph({})
		.setDefaultEdgeLabel(function() { return {}; });

	var render = new dagreD3.render();

	var svg = d3.select("svg"),
		inner = d3.select("svg g"),
		zoom = d3.behavior.zoom().on("zoom", function() {
			inner.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
		});
	svg.call(zoom).on("dblclick.zoom", null);

	fetchResponses();
	initializeGraph(currentDiscussionId, tryDraw);
	startBloodhound();
	
	var clipboard = new Clipboard('.urlButton');
	clipboard.on('success', function(e) {
		notify("info", "Copied response id to clipboard!", "glyphicon glyphicon-link")
	});

	function initializeGraph(id, cb){
		d3.json('../../api/discussions/id/' + id, function(data){
			cb(data.responses, data.discussion)
		});
	}
	
	function tryDraw(responses, discussion){
		responses.forEach(function(response){
			var relationshipType = discussion.relationships.filter(function(relationship){  return relationship[response._id] !== undefined })[0][response._id].relationshipType;
			response.text = response.text.replace(/(.{80})/g, "$1<br>");
			if (discussion.citations.indexOf(response._id) !== -1){
				g.setNode("n"+response._id, { id: "n"+response._id, labelType: 'html', label: compiledResponseTemplate({templateData : {response: response, class: "citationResponse", responseTypeColor: responseColors[relationshipType]}}), class: "unselected-node "});
			} else {
				g.setNode("n"+response._id, { id: "n"+response._id, labelType: 'html', label: compiledResponseTemplate({templateData : {response: response, class: "originalResponse", responseTypeColor: responseColors[relationshipType]}}), class: "unselected-node"});
			}
			discussion.relationships.slice(1,discussion.relationships.length).forEach(function(relationship){
				if (relationship.hasOwnProperty(response._id)){
					g.setEdge("n"+relationship[response._id]["relatedResponse"], "n"+response._id, {
						style: "fill: none;",
						arrowhead: 'undirected',
						//lineInterpolate: 'basis'
					});
				}
			})
		});
				
		$('#responses').on('click', '.cite-response', function(e){
			var idOfClickedResponse = $(e.target).closest('.thumbnail').attr('id');
			var clickedResponse = $.grep(fetchedResponses, function(e){ return e._id == idOfClickedResponse; })[0];
			
			if ("n"+idOfClickedResponse !== currentResponse){
				clickedResponse.text = clickedResponse.text.replace(/(.{80})/g, "$1<br>")
				addResponseToDiscussion(clickedResponse, true, addNewNode);
				$('#responseModal').modal('hide');
			} else {
				if($('.alert', '#'+idOfClickedResponse).length !== 1) {
					$(e.target).closest('.thumbnail').append( "<div class='alert alert-warning'>Can't cite a response to itself</div>" );
				}
			}	
			switchReplyView(currentResponse);	
		});
		
		$('#responseBrowserSearchButton').on('click',function(e) {
			e.preventDefault();
			var searchQuery = {
				title: ($('#responseTitle').val()),
				text: ($('#responseKeywords').val())
			};
			fetchResponses(searchQuery);
		});
		
		$('#responses').on('click', '.use-title',function(e){
			var idOfClickedResponse = $(e.target).closest('.thumbnail').attr('id');
			var clickedResponseTitle = $.grep(fetchedResponses, function(e){ return e._id == idOfClickedResponse; })[0]['title'];
			$('#responseModal').modal('hide');
			$('#newResponseTitle').val(clickedResponseTitle);
		})
		
		renderGraph(g);
		
		function renderGraph(){
			g.nodes().forEach(function(v) {
			  var node = g.node(v);
			  node.rx = node.ry = 1;
			});

			g.graph().transition = function(selection) {
			  return selection.transition().duration(500);
			};

			// Render the graph into svg g
			d3.select("svg g").call(render, g);

			svg.selectAll(".node").on('mousedown', function(){
				if (mouseMovement){
					textSelected = true;
					mouseMovement = false;
				}
				d3.event.stopPropagation();
			})

			svg.selectAll(".node").on('mousemove', function(){
				mouseMovement = true;
			});
			
			svg.selectAll('.node').on('click',function(e){
				currentResponse = e;
				console.log(e)
			})

			svg.selectAll('.submit-reply-button').on('click',function(e){
				var form = d3.select(this.parentNode.parentNode).attr("id");
				var id = "n"+form.substring(form.indexOf("-")+1, form.length);
				switchReplyView(id); //this closes the reply button without checking if the reply actually got registered by the server
				var newResponse = {};
				$.each($('#'+form).serializeArray(), function(i, field) {
					newResponse[field.name] = field.value;
				});
				addResponseToDiscussion(newResponse, false, addNewNode);
			})

			svg.selectAll('.reply-button').on('click',function(e){
				var idOfClickedResponse = "n"+d3.select(this.parentNode).attr('id');
				//console.log($(e.target).closest('.unselected-node').find('.inputTemplate')).css('display', 'inline-block');
				//svg.select(".inputTemplate").classed("hiddenthing", false);
				//svg.select(".inputTemplate").classed("vizzything", true);
				//console.log(svg.select(".inputTemplate"))
				//svg.select(".inputTemplate").attr("visibility", "visible");
				//$(e.target).closest('.unselected-node').find('.inputTemplate').css( "display", "inline-block" );
				//console.log(g.node(idOfClickedResponse).class);
				//g.node(idOfClickedResponse).class = "testsex"
				switchReplyView(idOfClickedResponse);
				renderGraph();
			});
		}
		
		function addNewNode(response, responseClass){
			notify("success", "Replied to conversation", "glyphicon glyphicon-ok-circle");
			response.text = response.text.replace(/(.{80})/g, "$1<br>");
			g.setNode("n"+response._id, { id: "n"+response._id, labelType: 'html', label: compiledResponseTemplate({templateData : {response: response, class: responseClass, responseTypeColor: "green"}}), class: "unselected-node"});
			g.setEdge(currentResponse, "n"+response._id, {	
				style: "fill: none;",
				arrowhead: 'undirected',
			});
			renderGraph();
		}

		function switchReplyView(id){
			if (g.node(id).label.indexOf('display:none') !== -1){
					g.node(id).label = g.node(id).label.replace("display:none","display:inline-block");				
				} else {
					g.node(id).label = g.node(id).label.replace("display:inline-block","display:none");								
				}
			}
	}
	
	function addResponseToDiscussion(newResponseData, isCitation, callback){
		if (isCitation){
			$.ajax({
				type: "POST",
				url: "../addCitationToDiscussion",
				data: {
					discussionId: currentDiscussionId,
					citationId: newResponseData['_id'],
					relatedResponse: currentResponse.substring(1),
					relationshipType: 'dissent' //replace
				},
				success: function(){
					callback(newResponseData, "citationResponse");
				},
				error: function(err){
					notify("warning", "Reply didn't go through. Please try again later", "glyphicon glyphicon-alert");
				}
			})
		} else {
			$.ajax({
				type: "POST",
				url: "../../responses",
				data: {
					discussionId: currentDiscussionId,
					responseTitle: newResponseData['title'],
					responseText: newResponseData['text'],
					created_by: "Daniel",
					relatedResponse: currentResponse.substring(1),
					relationshipType: 'dissent' //replace
				},
				success: function(newResponse){
					callback(newResponse, "originalResponse");
				},
				error: function(err){
					replyFailAlert();
				}
			})		
		}
	}
	
});

function notify(type, message, gylph){
	$.notify({
		message: message,
		icon: gylph,
	},{
		allow_dismiss: false,
		position: "absolute",
		element: '#interface',
		type: type,
			placement: {
			from: "bottom",
			align: "left"
		},
		animate: {
			enter: 'animated fadeInUp',
			exit: 'animated fadeOutDown'
		},
		delay: 2000,
		timer: 1000,
	});
}

function fetchResponses(searchQuery){
	$.ajax({
		type: "GET",
		url: "../../api/responses",
		data: searchQuery,
		success: function(data){
			fetchedResponses = data;
			loadResponseBrowser();
		}
	})
}


function loadResponseBrowser(){
	$("#responses").html(responseBrowser({responses: fetchedResponses}));
}

var mouseMovement;
