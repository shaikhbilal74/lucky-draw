// ============================================================
// LUCKY DRAW ADMIN DASHBOARD
// SECURE SUPABASE AUTH + ADMIN AUTHORIZATION + REALTIME
// DATE-WISE DRAW SCOPES
// ============================================================

const SUPABASE_URL =
    "https://mvwaanrbqjozxbncogzf.supabase.co";

// This is a Supabase publishable key.
// NEVER put a Supabase service_role/secret key in browser code.
const SUPABASE_KEY =
    "sb_publishable_-jVZOnMljZt3VqDkwHCf_g_o8GDU_6c";

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


// ============================================================
// GLOBAL STATE
// ============================================================

let participantRealtimeChannel = null;

let currentParticipants = [];

let isAdminAuthenticated = false;

let isInitializing = true;

let dashboardLoadInProgress = false;

let authTransitionInProgress = false;

// ------------------------------------------------------------
// DATE-WISE DRAW STATE
// ------------------------------------------------------------
//
// "all" means every participant.
// Otherwise the value is:
// "YYYY-MM-DD"
// ------------------------------------------------------------

let currentDrawScope = "all";

let availableDrawDates = [];


// ============================================================
// SECURITY / DISPLAY HELPERS
// ============================================================

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


function getElement(id) {

    return document.getElementById(id);

}


// ============================================================
// DATE HELPERS
// ============================================================

function getIndiaDateFromTimestamp(timestamp) {

    if (!timestamp) {
        return null;
    }

    try {

        return new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }
        ).format(
            new Date(timestamp)
        );

    } catch (error) {

        console.error(
            "Unable to convert timestamp to India date:",
            error
        );

        return null;

    }

}


function formatDrawDate(dateString) {

    if (!dateString) {
        return "All Dates";
    }

    try {

        const date =
            new Date(
                `${dateString}T00:00:00+05:30`
            );

        return new Intl.DateTimeFormat(
            "en-IN",
            {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "long",
                year: "numeric"
            }
        ).format(date);

    } catch (error) {

        return dateString;

    }

}


// ============================================================
// ADMIN AUTHORIZATION
// ============================================================

async function verifyAdminAccess() {

    try {

        const {
            data: { user },
            error: userError
        } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {

            if (userError) {

                console.error(
                    "Unable to get authenticated user:",
                    userError
                );

            }

            return false;

        }


        const {
            data,
            error
        } =
            await supabaseClient
                .from("admin_users")
                .select("user_id")
                .eq(
                    "user_id",
                    user.id
                )
                .maybeSingle();


        if (error) {

            console.error(
                "Admin authorization check failed:",
                error
            );

            return false;

        }


        return data?.user_id === user.id;

    } catch (error) {

        console.error(
            "Admin verification error:",
            error
        );

        return false;

    }

}


// ============================================================
// PAGE STATE
// ============================================================

function showLoginPage(
    errorMessage = ""
) {

    const loginPage =
        getElement("loginPage");

    const adminPage =
        getElement("adminPage");


    if (adminPage) {

        adminPage.classList.remove(
            "active-page"
        );

    }


    if (loginPage) {

        loginPage.classList.add(
            "active-page"
        );

    }


    const loginError =
        getElement("loginError");


    if (loginError) {

        loginError.textContent =
            errorMessage;

    }


    const email =
        getElement("adminEmail");

    const password =
        getElement("adminPassword");


    if (password) {

        password.value = "";

    }


    if (email && !errorMessage) {

        email.focus();

    }


    isAdminAuthenticated = false;

}


async function showAdminDashboard() {

    if (dashboardLoadInProgress) {

        return;

    }


    dashboardLoadInProgress = true;


    try {

        const loginPage =
            getElement("loginPage");

        const adminPage =
            getElement("adminPage");


        if (loginPage) {

            loginPage.classList.remove(
                "active-page"
            );

        }


        if (adminPage) {

            adminPage.classList.add(
                "active-page"
            );

        }


        const {
            data: { user }
        } =
            await supabaseClient.auth.getUser();


        const loggedInAdmin =
            getElement("loggedInAdmin");


        if (loggedInAdmin && user) {

            loggedInAdmin.textContent =
                "Signed in as: " +
                (
                    user.email ||
                    "Administrator"
                );

        }


        isAdminAuthenticated = true;


        await loadParticipants();


        await loadCurrentDrawStatus();


        startParticipantRealtime();

    } finally {

        dashboardLoadInProgress = false;

    }

}


// ============================================================
// LOGIN
// ============================================================

async function loginAdmin(event) {

    event.preventDefault();


    const emailInput =
        getElement("adminEmail");

    const passwordInput =
        getElement("adminPassword");

    const loginButton =
        getElement("loginButton");

    const loginError =
        getElement("loginError");


    const email =
        emailInput?.value.trim() || "";

    const password =
        passwordInput?.value || "";


    if (loginError) {

        loginError.textContent = "";

    }


    if (!email || !password) {

        if (loginError) {

            loginError.textContent =
                "Please enter your email and password.";

        }

        return;

    }


    if (loginButton) {

        loginButton.disabled = true;

        loginButton.textContent =
            "Signing in...";

    }


    try {

        const {
            data,
            error
        } =
            await supabaseClient.auth
                .signInWithPassword({
                    email,
                    password
                });


        if (error || !data?.user) {

            console.error(
                "Supabase login error:",
                error
            );

            if (loginError) {

                loginError.textContent =
                    "Invalid email or password.";

            }

            return;

        }


        const isAdmin =
            await verifyAdminAccess();


        if (!isAdmin) {

            await supabaseClient.auth.signOut();


            if (loginError) {

                loginError.textContent =
                    "Access denied. This account is not an authorized administrator.";

            }

            return;

        }


        await showAdminDashboard();

    } catch (error) {

        console.error(
            "Login exception:",
            error
        );


        if (loginError) {

            loginError.textContent =
                "Unable to login. Please try again.";

        }

    } finally {

        if (loginButton) {

            loginButton.disabled = false;

            loginButton.textContent =
                "Login";

        }

    }

}


// ============================================================
// LOGOUT
// ============================================================

async function logoutAdmin() {

    await stopParticipantRealtime();


    isAdminAuthenticated = false;

    currentParticipants = [];

    currentDrawScope = "all";

    availableDrawDates = [];


    try {

        const {
            error
        } =
            await supabaseClient.auth.signOut();


        if (error) {

            console.error(
                "Logout error:",
                error
            );

        }

    } catch (error) {

        console.error(
            "Logout exception:",
            error
        );

    }


    const participantList =
        getElement("participantList");


    if (participantList) {

        participantList.innerHTML = "";

    }


    showLoginPage();

}


// ============================================================
// PARTICIPANTS
// ============================================================

async function getParticipants() {

    if (!isAdminAuthenticated) {

        return [];

    }


    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from("Participants")
                .select(
                    "id, created_at, registration_id, name, phone, area, city, source, photo_url"
                )
                .order(
                    "id",
                    {
                        ascending: true
                    }
                );


        if (error) {

            console.error(
                "Participant fetch error:",
                error
            );

            return [];

        }


        return data || [];

    } catch (error) {

        console.error(
            "Participant fetch exception:",
            error
        );

        return [];

    }

}


// ============================================================
// LOAD PARTICIPANTS
// ============================================================

async function loadParticipants() {

    if (!isAdminAuthenticated) {

        return;

    }


    const participants =
        await getParticipants();


    currentParticipants =
        participants;


    // --------------------------------------------------------
    // Build date tabs automatically from created_at
    // --------------------------------------------------------

    buildDrawScopeTabs(
        participants
    );


    // --------------------------------------------------------
    // Show currently selected scope
    // --------------------------------------------------------

    renderCurrentScope();


}


// ============================================================
// BUILD DATE TABS
// ============================================================

function buildDrawScopeTabs(
    participants
) {

    const tabsContainer =
        getElement("drawScopeTabs");


    if (!tabsContainer) {

        console.warn(
            "drawScopeTabs element was not found."
        );

        return;

    }


    const uniqueDates =
        new Set();


    participants.forEach(
        function(participant) {

            const indiaDate =
                getIndiaDateFromTimestamp(
                    participant.created_at
                );


            if (indiaDate) {

                uniqueDates.add(
                    indiaDate
                );

            }

        }
    );


    availableDrawDates =
        Array.from(uniqueDates)
            .sort();


    // --------------------------------------------------------
    // If current selected date no longer exists,
    // return to All Dates.
    // --------------------------------------------------------

    if (
        currentDrawScope !== "all" &&
        !availableDrawDates.includes(
            currentDrawScope
        )
    ) {

        currentDrawScope =
            "all";

    }


    tabsContainer.innerHTML = "";


    // --------------------------------------------------------
    // ALL DATES TAB
    // --------------------------------------------------------

    const allButton =
        document.createElement("button");


    allButton.type =
        "button";


    allButton.className =
        "draw-scope-tab";


    allButton.dataset.scope =
        "all";


    allButton.textContent =
        "Draw All Dates";


    allButton.addEventListener(
        "click",
        function() {

            selectDrawScope(
                "all"
            );

        }
    );


    tabsContainer.appendChild(
        allButton
    );


    // --------------------------------------------------------
    // DATE TABS
    // --------------------------------------------------------

    availableDrawDates.forEach(
        function(dateString) {

            const button =
                document.createElement("button");


            button.type =
                "button";


            button.className =
                "draw-scope-tab";


            button.dataset.scope =
                dateString;


            button.textContent =
                formatDrawDate(
                    dateString
                );


            button.addEventListener(
                "click",
                function() {

                    selectDrawScope(
                        dateString
                    );

                }
            );


            tabsContainer.appendChild(
                button
            );

        }
    );


    updateDrawScopeTabActiveState();

}


// ============================================================
// SELECT DRAW SCOPE
// ============================================================

async function selectDrawScope(
    scope
) {

    currentDrawScope =
        scope || "all";


    // --------------------------------------------------------
    // Clear search when switching dates.
    // --------------------------------------------------------

    const searchInput =
        getElement("searchInput");


    if (searchInput) {

        searchInput.value = "";

    }


    updateDrawScopeTabActiveState();


    renderCurrentScope();


    // --------------------------------------------------------
    // Load winner for this specific scope.
    // --------------------------------------------------------

    await loadCurrentDrawStatus();

}


// ============================================================
// UPDATE ACTIVE TAB
// ============================================================

function updateDrawScopeTabActiveState() {

    const tabsContainer =
        getElement("drawScopeTabs");


    if (!tabsContainer) {

        return;

    }


    const buttons =
        tabsContainer.querySelectorAll(
            "button"
        );


    buttons.forEach(
        function(button) {

            const isActive =
                button.dataset.scope ===
                currentDrawScope;


            button.classList.toggle(
                "active",
                isActive
            );

        }
    );

}


// ============================================================
// FILTER PARTICIPANTS FOR CURRENT SCOPE
// ============================================================

function getParticipantsForCurrentScope() {

    if (
        currentDrawScope ===
        "all"
    ) {

        return [
            ...currentParticipants
        ];

    }


    return currentParticipants.filter(
        function(participant) {

            return (
                getIndiaDateFromTimestamp(
                    participant.created_at
                ) ===
                currentDrawScope
            );

        }
    );

}


// ============================================================
// RENDER CURRENT SCOPE
// ============================================================

function renderCurrentScope() {

    const scopedParticipants =
        getParticipantsForCurrentScope();


    displayParticipants(
        scopedParticipants
    );


    updateParticipantCount(
        scopedParticipants
    );


    updateSelectedDrawScopeLabel();


    updateDrawScopeTabActiveState();


}


// ============================================================
// UPDATE PARTICIPANT COUNT
// ============================================================

function updateParticipantCount(
    participants
) {

    const countElement =
        getElement("participantCount");


    if (countElement) {

        countElement.textContent =
            participants.length;

    }

}


// ============================================================
// SELECTED SCOPE LABEL
// ============================================================

function updateSelectedDrawScopeLabel() {

    const label =
        getElement(
            "selectedDrawScope"
        );


    if (!label) {

        return;

    }


    if (
        currentDrawScope ===
        "all"
    ) {

        label.textContent =
            "Selected: All Dates";

        return;

    }


    label.textContent =
        "Selected: " +
        formatDrawDate(
            currentDrawScope
        );

}


// ============================================================
// REALTIME
// ============================================================

function startParticipantRealtime() {

    if (
        !isAdminAuthenticated ||
        participantRealtimeChannel
    ) {

        return;

    }


    participantRealtimeChannel =
        supabaseClient
            .channel(
                "participants-live-updates"
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "Participants"
                },
                async function(payload) {

                    console.log(
                        "Live participant update:",
                        payload.eventType,
                        payload
                    );


                    await loadParticipants();


                    // ------------------------------------------------
                    // Restore current scoped winner after a participant
                    // update because the selected participant pool may
                    // have changed.
                    // ------------------------------------------------

                    await loadCurrentDrawStatus();


                    const searchInput =
                        getElement(
                            "searchInput"
                        );


                    if (
                        searchInput &&
                        searchInput.value.trim()
                    ) {

                        await performSearch();

                    }

                }
            )
            .subscribe(
                function(status) {

                    console.log(
                        "Realtime status:",
                        status
                    );


                    if (
                        status ===
                        "CHANNEL_ERROR"
                    ) {

                        console.error(
                            "Realtime channel error. Check Supabase Realtime publication and RLS policies."
                        );

                    }


                    if (
                        status ===
                        "TIMED_OUT"
                    ) {

                        console.error(
                            "Realtime connection timed out."
                        );

                    }

                }
            );

}


async function stopParticipantRealtime() {

    if (!participantRealtimeChannel) {

        return;

    }


    try {

        await supabaseClient.removeChannel(
            participantRealtimeChannel
        );

    } catch (error) {

        console.error(
            "Realtime cleanup error:",
            error
        );

    }


    participantRealtimeChannel =
        null;

}


// ============================================================
// SOURCE LABEL
// ============================================================

function getProfessionalSource(
    participant
) {

    const rawSource =
        String(
            participant?.source || ""
        )
            .trim()
            .toLowerCase();


    const photoSources =
        new Set([
            "photo upload",
            "photo_uploaded",
            "photo-upload",
            "uploaded",
            "upload",
            "photo",
            "uploaded photo",
            "uploaded_photo",
            "image upload",
            "image_uploaded"
        ]);


    if (
        photoSources.has(
            rawSource
        ) ||
        Boolean(
            participant?.photo_url
        )
    ) {

        return "Photo Upload";

    }


    return "Manual Registration";

}


// ============================================================
// DISPLAY PARTICIPANTS
// ============================================================

function displayParticipants(
    participants
) {

    const participantList =
        getElement(
            "participantList"
        );


    if (!participantList) {

        return;

    }


    participantList.innerHTML =
        "";


    if (!participants.length) {

        participantList.innerHTML = `
            <tr>
                <td colspan="7" class="no-data">
                    No participants found.
                </td>
            </tr>
        `;

        return;

    }


    participants.forEach(
        function(
            participant,
            index
        ) {

            const registrationId =
                participant.registration_id ||
                participant.id ||
                "-";


            const sourceText =
                getProfessionalSource(
                    participant
                );


            participantList.innerHTML += `
                <tr>

                    <td>
                        ${index + 1}
                    </td>

                    <td>
                        <strong>
                            ${escapeHTML(
                                registrationId
                            )}
                        </strong>
                    </td>

                    <td>
                        ${escapeHTML(
                            participant.name ||
                            "-"
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            participant.phone ||
                            "-"
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            participant.area ||
                            "-"
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            participant.city ||
                            "-"
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            sourceText
                        )}
                    </td>

                </tr>
            `;

        }
    );

}


// ============================================================
// VIEW PARTICIPANTS
// ============================================================

async function viewParticipants() {

    renderCurrentScope();

}


// ============================================================
// SEARCH
// ============================================================

async function performSearch() {

    const searchInput =
        getElement(
            "searchInput"
        );


    if (!searchInput) {

        return;

    }


    const searchValue =
        searchInput.value
            .trim()
            .toLowerCase();


    const scopedParticipants =
        getParticipantsForCurrentScope();


    if (!searchValue) {

        displayParticipants(
            scopedParticipants
        );


        updateParticipantCount(
            scopedParticipants
        );


        return;

    }


    const filtered =
        scopedParticipants.filter(
            function(participant) {

                const source =
                    getProfessionalSource(
                        participant
                    )
                        .toLowerCase();


                return (

                    String(
                        participant.name ||
                        ""
                    )
                        .toLowerCase()
                        .includes(
                            searchValue
                        )

                    ||

                    String(
                        participant.phone ||
                        ""
                    )
                        .toLowerCase()
                        .includes(
                            searchValue
                        )

                    ||

                    String(
                        participant.registration_id ||
                        ""
                    )
                        .toLowerCase()
                        .includes(
                            searchValue
                        )

                    ||

                    String(
                        participant.area ||
                        ""
                    )
                        .toLowerCase()
                        .includes(
                            searchValue
                        )

                    ||

                    String(
                        participant.city ||
                        ""
                    )
                        .toLowerCase()
                        .includes(
                            searchValue
                        )

                    ||

                    source.includes(
                        searchValue
                    )

                );

            }
        );


    displayParticipants(
        filtered
    );


    updateParticipantCount(
        filtered
    );

}


// ============================================================
// SEARCH BUTTON
// ============================================================

async function searchParticipants() {

    await performSearch();

}


// ============================================================
// CLEAR SEARCH
// ============================================================

async function clearSearch() {

    const searchInput =
        getElement(
            "searchInput"
        );


    if (searchInput) {

        searchInput.value =
            "";

    }


    renderCurrentScope();

}


// ============================================================
// DRAW EDGE FUNCTION HELPER
// ============================================================

async function callDrawFunction(
    action
) {

    if (!isAdminAuthenticated) {

        return {
            success: false,
            error: "Administrator access required."
        };

    }


    try {

        const {
            data,
            error
        } =
            await supabaseClient.functions.invoke(
                "draw-winner",
                {
                    body: {
                        action: action,
                        draw_scope:
                            currentDrawScope
                    }
                }
            );


        if (error) {

            console.error(
                "Draw Edge Function error:",
                error
            );


            let functionError =
                error.message ||
                "Unable to communicate with draw service.";


            // --------------------------------------------------------
            // Supabase may return the actual Edge Function response
            // inside error.context.
            // --------------------------------------------------------

            try {

                if (
                    error.context &&
                    typeof error.context.json ===
                        "function"
                ) {

                    const responseBody =
                        await error.context.json();


                    if (
                        responseBody?.error
                    ) {

                        functionError =
                            responseBody.error;

                    }

                }

            } catch (
                responseParseError
            ) {

                console.warn(
                    "Unable to parse Edge Function error response:",
                    responseParseError
                );

            }


            return {
                success: false,
                error: functionError
            };

        }


        return (
            data || {
                success: false,
                error: "No response received from draw service."
            }
        );

    } catch (error) {

        console.error(
            "Draw function exception:",
            error
        );


        return {
            success: false,
            error:
                "Unable to communicate with the draw service."
        };

    }

}


// ============================================================
// LOAD CURRENT DRAW STATUS
// ============================================================

async function loadCurrentDrawStatus() {

    if (!isAdminAuthenticated) {

        return;

    }


    const result =
        await callDrawFunction(
            "status"
        );


    if (!result) {

        return;

    }


    if (
        result.success &&
        result.completed &&
        Array.isArray(
            result.winners
        ) &&
        result.winners.length
    ) {

        displayWinners(
            result.winners
        );


        return;

    }


    showNoWinner();


}


// ============================================================
// SHOW NO WINNER
// ============================================================

function showNoWinner() {

    const winnerResult =
        getElement(
            "winnerResult"
        );


    if (!winnerResult) {

        return;

    }


    winnerResult.innerHTML = `
        <p>
            No winner selected yet.
        </p>
    `;

}


// ============================================================
// DRAW MODAL
// ============================================================

function openDrawModal() {

    const modal =
        getElement(
            "drawModal"
        );


    const message =
        getElement(
            "drawModalMessage"
        );


    const confirmButton =
        getElement(
            "confirmDrawButton"
        );


    const selectedDateText =
        currentDrawScope ===
            "all"
            ? "all participants"
            : formatDrawDate(
                currentDrawScope
            );


    if (message) {

        message.textContent =
            `Are you sure you want to draw 3 winners from ${selectedDateText}?`;

    }


    if (confirmButton) {

        confirmButton.textContent =
            "🎉 Draw Winner";

    }


    if (modal) {

        modal.classList.add(
            "show"
        );

    }

}


function closeDrawModal() {

    const modal =
        getElement(
            "drawModal"
        );


    if (modal) {

        modal.classList.remove(
            "show"
        );

    }

}


// ============================================================
// DRAW WINNER BUTTON
// ============================================================

async function drawWinner() {

    const participants =
        getParticipantsForCurrentScope();


    if (!participants.length) {

        alert(
            currentDrawScope ===
                "all"
                ? "No participants available for the Lucky Draw!"
                : `No participants registered on ${formatDrawDate(currentDrawScope)}.`
        );

        return;

    }


    if (
        participants.length <
        3
    ) {

        alert(
            currentDrawScope ===
                "all"
                ? "At least 3 participants are required for a 3-winner lucky draw."
                : `At least 3 participants registered on ${formatDrawDate(currentDrawScope)} are required for a 3-winner lucky draw.`
        );

        return;

    }


    // --------------------------------------------------------
    // Check whether this scope already has a completed draw.
    // --------------------------------------------------------

    const status =
        await callDrawFunction(
            "status"
        );


    if (
        status?.success &&
        status?.completed
    ) {

        alert(
            `The draw for ${
                currentDrawScope === "all"
                    ? "All Dates"
                    : formatDrawDate(
                        currentDrawScope
                    )
            } is already completed. Reset this draw before selecting new winners.`
        );

        if (
            Array.isArray(
                status.winners
            ) &&
            status.winners.length
        ) {

            displayWinners(
                status.winners
            );

        }

        return;

    }


    openDrawModal();

}


// ============================================================
// CONFIRM DRAW
// ============================================================

async function confirmDraw() {

    closeDrawModal();


    const confirmButton =
        getElement(
            "confirmDrawButton"
        );


    if (confirmButton) {

        confirmButton.disabled =
            true;

        confirmButton.textContent =
            "Drawing...";

    }


    try {

        const result =
            await callDrawFunction(
                "draw"
            );


        if (
            !result ||
            !result.success
        ) {

            alert(
                result?.error ||
                "Unable to complete the lucky draw."
            );

            return;

        }


        if (
            Array.isArray(
                result.winners
            )
        ) {

            displayWinners(
                result.winners
            );

        }


        // --------------------------------------------------------
        // Refresh count and current scope without changing scope.
        // --------------------------------------------------------

        renderCurrentScope();

    } catch (error) {

        console.error(
            "Confirm draw exception:",
            error
        );


        alert(
            "Unable to complete the lucky draw. Please try again."
        );

    } finally {

        if (confirmButton) {

            confirmButton.disabled =
                false;

            confirmButton.textContent =
                "🎉 Draw Winner";

        }

    }

}


// ============================================================
// DISPLAY THREE WINNERS
// ============================================================

function displayWinners(
    winners
) {

    const winnerResult =
        getElement(
            "winnerResult"
        );


    if (
        !winnerResult ||
        !Array.isArray(winners) ||
        !winners.length
    ) {

        return;

    }


    winnerResult.innerHTML =
        "";


    winners
        .slice(0, 3)
        .forEach(
            function(
                winner,
                index
            ) {

                const registrationId =
                    winner.registration_id ||
                    winner.id ||
                    "-";


                const winnerNumber =
                    index + 1;


                winnerResult.innerHTML += `

                    <div>

                        <h3>
                            🏅 WINNER ${winnerNumber}
                        </h3>

                        <p>
                            <strong>
                                Registration ID:
                            </strong>

                            ${escapeHTML(
                                registrationId
                            )}
                        </p>

                        <p>
                            <strong>
                                Name:
                            </strong>

                            ${escapeHTML(
                                winner.name ||
                                "-"
                            )}
                        </p>

                        <p>
                            <strong>
                                Phone:
                            </strong>

                            ${escapeHTML(
                                winner.phone ||
                                "-"
                            )}
                        </p>

                        <p>
                            <strong>
                                Area:
                            </strong>

                            ${escapeHTML(
                                winner.area ||
                                "-"
                            )}
                        </p>

                        <p>
                            <strong>
                                City:
                            </strong>

                            ${escapeHTML(
                                winner.city ||
                                "-"
                            )}
                        </p>

                    </div>

                `;

            }
        );

}


// ============================================================
// RESET DRAW
// ============================================================

async function resetDraw() {

    // --------------------------------------------------------
    // First check whether the selected scope actually has
    // a completed draw.
    // --------------------------------------------------------

    const status =
        await callDrawFunction(
            "status"
        );


    if (
        !status?.success ||
        !status?.completed
    ) {

        showNoWinner();

        return;

    }


    const modal =
        getElement(
            "resetModal"
        );


    if (modal) {

        modal.classList.add(
            "show"
        );

    }

}


// ============================================================
// CLOSE RESET MODAL
// ============================================================

function closeResetModal() {

    const modal =
        getElement(
            "resetModal"
        );


    if (modal) {

        modal.classList.remove(
            "show"
        );

    }

}


// ============================================================
// CONFIRM RESET DRAW
// ============================================================

async function confirmResetDraw() {

    closeResetModal();


    const confirmButton =
        getElement(
            "confirmResetButton"
        );


    if (confirmButton) {

        confirmButton.disabled =
            true;

        confirmButton.textContent =
            "Resetting...";

    }


    try {

        const result =
            await callDrawFunction(
                "reset"
            );


        if (
            !result ||
            !result.success
        ) {

            alert(
                result?.error ||
                "Unable to reset the selected draw."
            );

            return;

        }


        // --------------------------------------------------------
        // Important:
        // No success alert here.
        // The UI simply updates.
        // --------------------------------------------------------

        showNoWinner();


    } catch (error) {

        console.error(
            "Reset draw exception:",
            error
        );


        alert(
            "Unable to reset the selected draw. Please try again."
        );

    } finally {

        if (confirmButton) {

            confirmButton.disabled =
                false;

            confirmButton.textContent =
                "🔄 Reset Draw";

        }

    }

}


// ============================================================
// EXCEL
// ============================================================
//
// IMPORTANT:
// This continues to download ALL participants.
// Date filtering is intentionally NOT applied here.
// ============================================================

async function downloadParticipants() {

    const participants =
        await getParticipants();


    if (!participants.length) {

        alert(
            "No participants available to download!"
        );

        return;

    }


    if (
        typeof XLSX ===
        "undefined"
    ) {

        alert(
            "Excel export library is unavailable. Please try again."
        );

        return;

    }


    const excelData =
        participants.map(
            function(
                participant,
                index
            ) {

                return {

                    "No.":
                        index + 1,

                    "Registration ID":
                        participant.registration_id ||
                        participant.id,

                    "Name":
                        participant.name ||
                        "",

                    "Phone":
                        participant.phone ||
                        "",

                    "Area":
                        participant.area ||
                        "",

                    "City":
                        participant.city ||
                        "",

                    "Source":
                        getProfessionalSource(
                            participant
                        ),

                    "Registration Date":
                        getIndiaDateFromTimestamp(
                            participant.created_at
                        ) ||
                        ""

                };

            }
        );


    const worksheet =
        XLSX.utils.json_to_sheet(
            excelData
        );


    worksheet["!cols"] = [

        {
            wch: 8
        },

        {
            wch: 20
        },

        {
            wch: 25
        },

        {
            wch: 18
        },

        {
            wch: 30
        },

        {
            wch: 25
        },

        {
            wch: 22
        },

        {
            wch: 20
        }

    ];


    const workbook =
        XLSX.utils.book_new();


    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Participants"
    );


    XLSX.writeFile(
        workbook,
        "Lucky_Draw_Participants.xlsx"
    );

}


// ============================================================
// DRAW HISTORY
// ============================================================
//
// Kept compatible with the existing Draw History section.
// The date-wise participant draw system does not delete history.
// ============================================================

async function loadDrawHistory() {

    if (!isAdminAuthenticated) {

        return;

    }


    const historyList =
        getElement(
            "drawHistoryList"
        );


    if (!historyList) {

        console.warn(
            "drawHistoryList element was not found."
        );

        return;

    }


    historyList.innerHTML = `

        <tr>

            <td
                colspan="6"
                class="no-data"
            >
                Loading draw history...
            </td>

        </tr>

    `;


    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from("draw_history")
                .select(`
                    id,
                    draw_number,
                    draw_date,
                    draw_time,
                    draw_scope,
                    winner_name,
                    winner_registration_id,
                    winner_phone
                `)
                .order(
                    "draw_number",
                    {
                        ascending: false
                    }
                )
                .order(
                    "id",
                    {
                        ascending: true
                    }
                );


        if (error) {

            console.error(
                "DRAW HISTORY FETCH ERROR:",
                error
            );


            historyList.innerHTML = `

                <tr>

                    <td
                        colspan="6"
                        class="no-data"
                    >
                        Unable to load draw history.
                    </td>

                </tr>

            `;

            return;

        }


        if (
            !data ||
            data.length === 0
        ) {

            historyList.innerHTML = `

                <tr>

                    <td
                        colspan="6"
                        class="no-data"
                    >
                        No draw history available.
                    </td>

                </tr>

            `;

            return;

        }


        historyList.innerHTML =
            "";


        data.forEach(
            function(draw) {

                historyList.innerHTML += `

                    <tr>

                        <td>

                            <strong>
                                ${escapeHTML(
                                    draw.draw_number ??
                                    "-"
                                )}
                            </strong>

                        </td>

                        <td>

                            ${escapeHTML(
                                draw.draw_date ||
                                "-"
                            )}

                        </td>

                        <td>

                            ${escapeHTML(
                                draw.draw_time ||
                                "-"
                            )}

                        </td>

                        <td>

                            ${escapeHTML(
                                draw.winner_name ||
                                "-"
                            )}

                        </td>

                        <td>

                            <strong>
                                ${escapeHTML(
                                    draw.winner_registration_id ||
                                    "-"
                                )}
                            </strong>

                        </td>

                        <td>

                            ${escapeHTML(
                                draw.winner_phone ||
                                "-"
                            )}

                        </td>

                    </tr>

                `;

            }
        );


        console.log(
            "Draw history loaded successfully:",
            data.length,
            "records"
        );


    } catch (error) {

        console.error(
            "DRAW HISTORY EXCEPTION:",
            error
        );


        historyList.innerHTML = `

            <tr>

                <td
                    colspan="6"
                    class="no-data"
                >
                    Unable to load draw history.
                </td>

            </tr>

        `;

    }

}


// ============================================================
// SHOW ADMIN SECTION
// ============================================================

function showAdminSection(
    sectionId,
    button
) {

    const sections =
        document.querySelectorAll(
            ".admin-section"
        );


    sections.forEach(
        function(section) {

            section.classList.remove(
                "active-admin-section"
            );

        }
    );


    const menuButtons =
        document.querySelectorAll(
            ".menu-btn"
        );


    menuButtons.forEach(
        function(menuButton) {

            menuButton.classList.remove(
                "active-menu"
            );

        }
    );


    const selectedSection =
        getElement(
            sectionId
        );


    if (selectedSection) {

        selectedSection.classList.add(
            "active-admin-section"
        );

    }


    if (button) {

        button.classList.add(
            "active-menu"
        );

    }


    if (
        sectionId ===
        "drawHistorySection"
    ) {

        loadDrawHistory();

    }

}


// ============================================================
// EXPOSE INLINE HTML FUNCTIONS
// ============================================================

window.showAdminSection =
    showAdminSection;

window.loadDrawHistory =
    loadDrawHistory;

window.selectDrawScope =
    selectDrawScope;


// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {

    // --------------------------------------------------------
    // LOGIN
    // --------------------------------------------------------

    const loginForm =
        getElement(
            "loginForm"
        );


    if (loginForm) {

        loginForm.addEventListener(
            "submit",
            loginAdmin
        );

    }


    // --------------------------------------------------------
    // LOGOUT
    // --------------------------------------------------------

    const logoutButton =
        getElement(
            "logoutButton"
        );


    if (logoutButton) {

        logoutButton.addEventListener(
            "click",
            logoutAdmin
        );

    }


    // --------------------------------------------------------
    // VIEW PARTICIPANTS
    // --------------------------------------------------------

    const viewButton =
        getElement(
            "viewParticipantsButton"
        );


    if (viewButton) {

        viewButton.addEventListener(
            "click",
            viewParticipants
        );

    }


    // --------------------------------------------------------
    // DRAW WINNER
    // --------------------------------------------------------

    const drawButton =
        getElement(
            "drawWinnerButton"
        );


    if (drawButton) {

        drawButton.addEventListener(
            "click",
            drawWinner
        );

    }


    // --------------------------------------------------------
    // RESET DRAW
    // --------------------------------------------------------

    const resetButton =
        getElement(
            "resetDrawButton"
        );


    if (resetButton) {

        resetButton.addEventListener(
            "click",
            resetDraw
        );

    }


    // --------------------------------------------------------
    // DOWNLOAD EXCEL
    // --------------------------------------------------------

    const downloadButton =
        getElement(
            "downloadButton"
        );


    if (downloadButton) {

        downloadButton.addEventListener(
            "click",
            downloadParticipants
        );

    }


    // --------------------------------------------------------
    // SEARCH
    // --------------------------------------------------------

    const searchButton =
        getElement(
            "searchButton"
        );


    if (searchButton) {

        searchButton.addEventListener(
            "click",
            searchParticipants
        );

    }


    // --------------------------------------------------------
    // CLEAR SEARCH
    // --------------------------------------------------------

    const clearButton =
        getElement(
            "clearSearchButton"
        );


    if (clearButton) {

        clearButton.addEventListener(
            "click",
            clearSearch
        );

    }


    // --------------------------------------------------------
    // LIVE SEARCH
    // --------------------------------------------------------

    const searchInput =
        getElement(
            "searchInput"
        );


    if (searchInput) {

        searchInput.addEventListener(
            "input",
            performSearch
        );

    }


    // --------------------------------------------------------
    // DRAW MODAL CANCEL
    // --------------------------------------------------------

    const cancelDrawButton =
        getElement(
            "cancelDrawButton"
        );


    if (cancelDrawButton) {

        cancelDrawButton.addEventListener(
            "click",
            closeDrawModal
        );

    }


    // --------------------------------------------------------
    // DRAW MODAL CONFIRM
    // --------------------------------------------------------

    const confirmDrawButton =
        getElement(
            "confirmDrawButton"
        );


    if (confirmDrawButton) {

        confirmDrawButton.addEventListener(
            "click",
            confirmDraw
        );

    }


    // --------------------------------------------------------
    // RESET MODAL CANCEL
    // --------------------------------------------------------

    const cancelResetButton =
        getElement(
            "cancelResetButton"
        );


    if (cancelResetButton) {

        cancelResetButton.addEventListener(
            "click",
            closeResetModal
        );

    }


    // --------------------------------------------------------
    // RESET MODAL CONFIRM
    // --------------------------------------------------------

    const confirmResetButton =
        getElement(
            "confirmResetButton"
        );


    if (confirmResetButton) {

        confirmResetButton.addEventListener(
            "click",
            confirmResetDraw
        );

    }

}


// ============================================================
// AUTH STATE CHANGES
// ============================================================

supabaseClient.auth.onAuthStateChange(
    async function(
        event,
        session
    ) {

        console.log(
            "Auth state:",
            event
        );


        // INITIAL_SESSION is handled by initializeAdmin().
        if (
            event ===
                "INITIAL_SESSION" ||
            isInitializing
        ) {

            return;

        }


        if (
            authTransitionInProgress
        ) {

            return;

        }


        if (
            event ===
                "SIGNED_OUT" ||
            !session
        ) {

            authTransitionInProgress =
                true;


            try {

                await stopParticipantRealtime();

                showLoginPage();

            } finally {

                authTransitionInProgress =
                    false;

            }


            return;

        }


        if (
            event ===
                "SIGNED_IN" ||
            event ===
                "TOKEN_REFRESHED" ||
            event ===
                "USER_UPDATED"
        ) {

            authTransitionInProgress =
                true;


            try {

                const isAdmin =
                    await verifyAdminAccess();


                if (!isAdmin) {

                    await supabaseClient.auth.signOut();


                    showLoginPage(
                        "Access denied. This account is not an authorized administrator."
                    );


                    return;

                }


                await showAdminDashboard();

            } finally {

                authTransitionInProgress =
                    false;

            }

        }

    }
);


// ============================================================
// INITIALIZATION
// ============================================================

async function initializeAdmin() {

    setupEventListeners();


    try {

        const {
            data: { session }
        } =
            await supabaseClient.auth.getSession();


        if (!session) {

            showLoginPage();

            return;

        }


        const isAdmin =
            await verifyAdminAccess();


        if (!isAdmin) {

            await supabaseClient.auth.signOut();


            showLoginPage(
                "Access denied. This account is not an authorized administrator."
            );


            return;

        }


        await showAdminDashboard();

    } catch (error) {

        console.error(
            "Admin initialization error:",
            error
        );


        await stopParticipantRealtime();


        showLoginPage(
            "Unable to initialize admin access. Please try again."
        );

    } finally {

        isInitializing =
            false;

    }

}


initializeAdmin();
