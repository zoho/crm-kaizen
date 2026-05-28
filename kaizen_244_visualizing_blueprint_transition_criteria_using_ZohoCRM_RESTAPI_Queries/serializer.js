var statusCode = result?.["$response"]?.status_code;
var resultBody = result?.result ?? result;

if (
    statusCode === 400 ||
    resultBody?.code === "RECORD_NOT_IN_PROCESS" ||
    !resultBody?.blueprint
) {
    return [{
        current_state: null,
        transition_name: "No transitions found",
        next_state: null,
        criteria_matched: null,
        criteria_matched_display: null,
        criteria_message: null
    }];
}

var blueprint = resultBody.blueprint;
var transitions = blueprint.transitions;
var processInfo = blueprint.process_info || {};
var currentState = processInfo.value || null;

var transitionsArray = Array.isArray(transitions)
    ? transitions
    : (transitions ? Object.values(transitions) : []);

if (transitionsArray.length === 0) {
    return [{
        current_state: currentState,
        transition_name: "No transitions found",
        next_state: null,
        criteria_matched: null,
        criteria_matched_display: null,
        criteria_message: null
    }];
}

var serialized = [];

for (var i = 0; i < transitionsArray.length; i++) {
    var transition = transitionsArray[i];
    var transitionName = transition.name || null;
    var nextState = transition.next_field_value || null;
    var criteriaMatched = transition.criteria_matched === true;
    var criteriaMatchedDisplay = criteriaMatched ? "true" : "false";
    var criteriaMessage = transition.criteria_message || null;
    var criteriaDetails = transition.criteria_details || null;

    var flatConditions = [];
    flattenCriteria(criteriaDetails, flatConditions);

    serialized.push({
        current_state: currentState,
        transition_name: transitionName,
        next_state: nextState,
        criteria_matched: criteriaMatchedDisplay,
        criteria: criteriaMessage,
    });
}

function flattenCriteria(node, conditions) {
    if (!node) return;

    var hasGroup = Array.isArray(node.group) && node.group.length > 0;

    if (hasGroup) {
        for (var k = 0; k < node.group.length; k++) {
            flattenCriteria(node.group[k], conditions);
        }
    } else {
        var fieldObj = node.field || {};
        conditions.push({
            field_api_name: fieldObj.api_name || null,
            field_id: fieldObj.id || null,
            comparator: node.comparator || null,
            value: node.value || null,
            value_type: node.type || "value"
        });
    }
}

return serialized;
