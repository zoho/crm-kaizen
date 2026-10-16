let allArrivals = [];
let currentFilter = "all";


/* =========================================================
   INITIALIZE WIDGET
   ========================================================= */

console.log("======================================");
console.log("ARRIVAL READINESS WIDGET");
console.log("JavaScript loaded");
console.log("======================================");


ZOHO.embeddedApp.on("PageLoad", function(data) {

    console.log("PageLoad fired");
    console.log("Page data:", data);

    loadDashboard();

});


ZOHO.embeddedApp.init()
.then(function() {

    console.log("Zoho Embedded App initialized");

})
.catch(function(error) {

    console.error(
        "Zoho Embedded App initialization failed:",
        error
    );

});


/* =========================================================
   LOAD DASHBOARD
   ========================================================= */

function loadDashboard() {

    console.log("======================================");
    console.log("loadDashboard() called");
    console.log("======================================");


    const container =
        document.getElementById("arrivalList");


    if (container) {

        container.innerHTML = `
            <div class="loading">
                Loading arrivals...
            </div>
        `;

    }


    const reqData = {
        "arguments": JSON.stringify({})
    };


    console.log(
        "Calling function: getarrivalreadiness"
    );

    console.log(
        "Request data:",
        reqData
    );


    ZOHO.CRM.FUNCTIONS.execute(
        "getarrivalreadiness",
        reqData
    )
    .then(function(response) {

        console.log("======================================");
        console.log("FUNCTION RESPONSE");
        console.log("======================================");

        console.log(
            "Complete response:",
            response
        );


        /*
         * The actual Deluge return value is inside:
         *
         * response.details.output
         */

        if (
            !response ||
            !response.details
        ) {

            console.error(
                "Invalid function response:",
                response
            );

            showError(
                "No valid response received from CRM."
            );

            return;

        }


        let result =
            response.details.output;


        console.log(
            "Raw function output:",
            result
        );


        /*
         * Deluge function output is returned
         * as a JSON string.
         */

        if (typeof result === "string") {

            try {

                result =
                    JSON.parse(result);

            }
            catch (error) {

                console.error(
                    "Unable to parse function output:",
                    error
                );

                showError(
                    "Invalid data received from CRM."
                );

                return;

            }

        }


        console.log(
            "Parsed function result:",
            result
        );


        /*
         * Check function status.
         */

        if (
            !result ||
            result.success !== true
        ) {

            console.error(
                "Function returned unsuccessful result:",
                result
            );

            showError(
                "Unable to load arrival data."
            );

            return;

        }


        console.log(
            "Function returned successfully."
        );


        /*
         * Update summary cards.
         */

        updateSummary(
            result.summary || {}
        );


        /*
         * Store arrivals.
         */

        allArrivals =
            result.arrivals || [];


        console.log(
            "Number of arrivals:",
            allArrivals.length
        );


        console.log(
            "Arrivals:",
            allArrivals
        );


        /*
         * Render arrival list.
         */

        renderArrivals();


        /*
         * Update timestamp.
         */

        const lastUpdated =
            document.getElementById("lastUpdated");


        if (
            lastUpdated &&
            result.generated_at
        ) {

            lastUpdated.innerText =
                "Updated " +
                formatDateTime(
                    result.generated_at
                );

        }


        console.log(
            "Dashboard updated successfully."
        );

    })
    .catch(function(error) {

        console.error("======================================");
        console.error("FUNCTION EXECUTION ERROR");
        console.error("======================================");

        console.error(
            "Error:",
            error
        );


        showError(
            "Something went wrong while loading arrivals."
        );

    });

}


/* =========================================================
   SUMMARY
   ========================================================= */

function updateSummary(summary) {

    document.getElementById("total").innerText =
        summary.total || 0;


    document.getElementById("ready").innerText =
        summary.ready || 0;


    document.getElementById("actionRequired").innerText =
        summary.action_required || 0;


    document.getElementById("attention").innerText =
        summary.attention || 0;

}


/* =========================================================
   RENDER ARRIVALS
   ========================================================= */

function renderArrivals() {

    const container =
        document.getElementById("arrivalList");


    if (!container) {

        console.error(
            "arrivalList element not found."
        );

        return;

    }


    let arrivals =
        [...allArrivals];


    /*
     * Apply filter.
     */

    if (currentFilter !== "all") {

        arrivals =
            allArrivals.filter(
                item =>
                    item.readiness === currentFilter
            );

    }


    /*
     * No records.
     */

    if (arrivals.length === 0) {

        container.innerHTML = `
            <div class="empty">
                No arrivals match this filter.
            </div>
        `;

        return;

    }


    /*
     * Priority order.
     */

    const priorityOrder = {

        "high": 1,
        "medium": 2,
        "low": 3

    };


    arrivals.sort(function(a, b) {

        return (
            (priorityOrder[
                String(a.priority || "low").toLowerCase()
            ] || 3)
            -
            (priorityOrder[
                String(b.priority || "low").toLowerCase()
            ] || 3)
        );

    });


    /*
     * Render rows.
     */

    container.innerHTML =
        arrivals
            .map(function(arrival) {

                return createArrivalRow(
                    arrival
                );

            })
            .join("");
            attachActionHandlers();

}

function attachActionHandlers() {

    console.log("Attaching action handlers...");

    document
        .querySelectorAll(".action-btn")
        .forEach(function(button) {

            button.addEventListener(
                "click",
                function() {

                    const id =
                        this.getAttribute("data-booking-id");

                    const action =
                        this.getAttribute("data-action");

                    console.log(
                        "=== ACTION CLICKED ==="
                    );

                    console.log(
                        "Booking ID:",
                        id
                    );

                    console.log(
                        "Action:",
                        action
                    );

                    takeAction(id, action);

                }
            );

        });

}
/* =========================================================
   ARRIVAL ROW
   ========================================================= */

function createArrivalRow(arrival) {

    const statusClass =
        String(arrival.readiness || "")
            .toLowerCase()
            .replaceAll(" ", "-");

    const action = arrival.action || "";

    return `
        <div class="arrival">
            <div>
                <div class="guest">${escapeHtml(arrival.guest)}</div>
                <div class="booking">${escapeHtml(arrival.booking)}</div>
            </div>

            <div class="arrival-time">
                ${formatDateTime(arrival.arrival)}
            </div>

            <div>
                <span class="status ${statusClass}">
                    ${escapeHtml(arrival.readiness)}
                </span>
            </div>

            <div class="issue">${escapeHtml(arrival.issue)}</div>

            <div>
                ${
                    action && action !== "No action"
                    ? `
                        <button
                            class="action-btn"
                            data-booking-id="${escapeHtml(arrival.id)}"
                            data-action="${escapeHtml(action)}">
                            ${escapeHtml(action)}
                        </button>
                    `
                    : ""
                }
            </div>
        </div>
    `;
}


/* =========================================================
   FILTERS
   ========================================================= */

function filterArrivals(filter, button) {

    currentFilter =
        filter;


    document
        .querySelectorAll(".filter")
        .forEach(function(btn) {

            btn.classList.remove(
                "active"
            );

        });


    if (button) {

        button.classList.add(
            "active"
        );

    }


    renderArrivals();

}


/* =========================================================
   ACTIONS
   ========================================================= */

function takeAction(id, action) {

    if (action === "Assign task") {

        createTask(id);

        return;

    }


    if (action === "Send reminder") {

        sendReminder(id);

        return;

    }


    openBooking(id);

}


/* =========================================================
   OPEN BOOKING
   ========================================================= */

function openBooking(id) {

    console.log(
        "Opening booking:",
        id
    );


    ZOHO.CRM.UI.Record.open({

        Entity: "Bookings",

        RecordID: id

    });

}


/* =========================================================
   CREATE TASK
   ========================================================= */

function createTask(id) {

    console.log("=== ASSIGN TASK ===");
    console.log("Booking ID:", id);

    if (!id) {
        alert("Booking ID is missing.");
        return;
    }

    /*
     * Get the Booking so that the task can
     * contain the guest and special-request details.
     */
    ZOHO.CRM.API.getRecord({
        Entity: "Bookings",
        RecordID: id
    })
    .then(function(response) {

        console.log("Booking retrieved:", response);

        const booking =
            response.data &&
            response.data[0];

        if (!booking) {

            alert("Unable to find the booking.");
            return;

        }

        const guestName =
            booking.Guest_Name ||
            "Guest";

        const bookingName =
            booking.Name ||
            "Booking";

        const specialRequest =
            booking.Special_Request ||
            "Special request requires attention.";

        const checkIn =
            booking.Check_In ||
            "";

        /*
         * Create CRM Task.
         */
        const task = {

            "Subject":
                "Prepare guest special request - " + guestName,

            "Due_Date":
                new Date()
                    .toISOString()
                    .split("T")[0],

            "Status":
                "Not Started",

            "Priority":
                "High",

            "Description":
                "Guest: " + guestName +
                "\nBooking: " + bookingName +
                "\nSpecial request: " + specialRequest +
                "\nArrival: " + checkIn +
                "\n\nPlease coordinate and confirm the request before guest arrival.",

            "What_Id": {
                "id": id
            },

            "$se_module":
                "Bookings"

        };

        console.log("Creating task:", task);

        return ZOHO.CRM.API.insertRecord({
            Entity: "Tasks",
            APIData: task,
            Trigger: ["workflow"]
        });

    })
    .then(function(response) {

        if (!response) {
            return;
        }

        console.log("=== TASK CREATED ===");
        console.log("Task creation response:", response);

        console.log(
            "Calling assignArrivalTask..."
        );

        /*
         * Update the Booking after the Task
         * has been successfully created.
         */
        return ZOHO.CRM.FUNCTIONS.execute(
            "assignarrivaltask",
            {
                arguments: JSON.stringify({
                    bookingId: id
                })
            }
        );

    })
    .then(function(response) {

        if (!response) {
            return;
        }

        console.log(
            "=== ASSIGN ARRIVAL TASK RESPONSE ==="
        );

        console.log(
            "assignArrivalTask response:",
            response
        );

        let result = response.details;

if (result && typeof result.output === "string") {

    try {
        result = JSON.parse(result.output);
    }
    catch (e) {

        console.error(
            "Unable to parse assignArrivalTask output:",
            e
        );

        alert(
            "Task was created, but booking status could not be updated."
        );

        return;
    }
}

console.log(
    "Parsed assignArrivalTask result:",
    result
);

if (!result || result.success !== true) {

    console.error(
        "Booking status update failed:",
        result
    );

    alert(
        "Task was created, but booking status could not be updated."
    );

    return;
}

console.log(
    "Booking status updated successfully."
);

alert(
    "Task assigned successfully."
);

loadDashboard();

  
        /*
         * Refresh the dashboard so that
         * getArrivalReadiness reads the
         * updated Request_Status.
         */
        console.log(
            "Refreshing dashboard..."
        );

        

  

    })
    .catch(function(error) {

        console.error(
            "=== CREATE TASK / UPDATE BOOKING ERROR ==="
        );

        console.error(
            "Full error:",
            error
        );

        if (error && error.data) {

            console.error(
                "Task API response data:",
                error.data
            );

            console.error(
                "Task API error:",
                JSON.stringify(
                    error.data,
                    null,
                    2
                )
            );

        }

        alert(
            "Unable to complete the action."
        );

    });

}

/* =========================================================
   SEND REMINDER
   ========================================================= */

/* =========================================================
   SEND REMINDER
   ========================================================= */

function sendReminder(id) {

    console.log("======================================");
    console.log("SEND REMINDER");
    console.log("Booking ID:", id);
    console.log("======================================");

    if (!id) {

        console.error(
            "Booking ID is missing."
        );

        alert("Unable to send reminder. Booking ID is missing.");

        return;
    }


    const reqData = {
        "arguments": JSON.stringify({
            "bookingId": id
        })
    };


    console.log(
        "Calling function: sendarrivalreminder"
    );

    console.log(
        "Request data:",
        reqData
    );


    ZOHO.CRM.FUNCTIONS.execute(
        "sendarrivalreminder",
        reqData
    )
    .then(function(response) {

        console.log("======================================");
        console.log("SEND REMINDER RESPONSE");
        console.log("======================================");

        console.log(
            "Complete response:",
            response
        );


        if (
            !response ||
            !response.details
        ) {

            console.error(
                "Invalid function response:",
                response
            );

            alert(
                "No valid response received from CRM."
            );

            return;
        }


        let result =
            response.details.output;


        console.log(
            "Raw function output:",
            result
        );


        if (typeof result === "string") {

            try {

                result =
                    JSON.parse(result);

            }
            catch (error) {

                console.error(
                    "Unable to parse function output:",
                    error
                );

                alert(
                    "Invalid response received from reminder function."
                );

                return;
            }
        }


        console.log(
            "Parsed reminder result:",
            result
        );


        if (
            result &&
            result.success === true
        ) {

            alert(
                "Reminder sent successfully."
            );

            /*
             * Reload dashboard so the latest
             * Booking data is reflected.
             */
            loadDashboard();

        }
        else {

            alert(
                (result && result.message)
                ||
                "Unable to send reminder."
            );

        }

    })
    .catch(function(error) {

        console.error(
            "======================================"
        );

        console.error(
            "SEND REMINDER FUNCTION ERROR"
        );

        console.error(
            "======================================"
        );

        console.error(
            error
        );


        alert(
            "Unable to send reminder."
        );

    });

}


/* =========================================================
   DATE FORMAT
   ========================================================= */

function formatDateTime(value) {

    if (!value) {

        return "";

    }


    const date =
        new Date(value);


    if (isNaN(date.getTime())) {

        return value;

    }


    return date.toLocaleString(
        undefined,
        {

            day: "2-digit",

            month: "short",

            hour: "2-digit",

            minute: "2-digit"

        }
    );

}


/* =========================================================
   HTML ESCAPING
   ========================================================= */

function escapeHtml(value) {

    return String(value || "")

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


/* =========================================================
   JAVASCRIPT ESCAPING
   ========================================================= */

function escapeJs(value) {

    return String(value || "")

        .replaceAll(
            "\\",
            "\\\\"
        )

        .replaceAll(
            "'",
            "\\'"
        );

}


/* =========================================================
   ERROR
   ========================================================= */

function showError(message) {

    const container =
        document.getElementById(
            "arrivalList"
        );


    if (!container) {

        return;

    }


    container.innerHTML = `

        <div class="empty">

            ${escapeHtml(message)}

        </div>

    `;

}