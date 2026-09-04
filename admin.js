// ============================================================
// LUCKY DRAW ADMIN DASHBOARD
// SECURE SUPABASE AUTH + ADMIN AUTHORIZATION + REALTIME
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
// DRAW WINNER EDGE FUNCTION
// ============================================================

const DRAW_FUNCTION_URL =
    `${SUPABASE_URL}/functions/v1/draw-winner`;


// ============================================================
// GLOBAL STATE
// ============================================================

let participantRealtimeChannel = null;

let allParticipants = [];

let currentParticipants = [];

let isAdminAuthenticated = false;

let isInitializing = true;

let dashboardLoadInProgress = false;

let authTransitionInProgress = false;


// ------------------------------------------------------------
// CURRENT DRAW SCOPE
// ------------------------------------------------------------

let currentDrawScope = "all";

let availableDrawDates = [];


// ------------------------------------------------------------
// DRAW HISTORY STATE
// ------------------------------------------------------------

let allDrawHistory = [];

let selectedHistoryDate = "all";

let availableHistoryDates = [];


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
// INDIA DATE HELPERS
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


// ============================================================
// FORMAT DATE FOR DISPLAY
// ============================================================

function formatDateForDisplay(dateString) {

    if (
        !dateString ||
        dateString === "all"
    ) {

        return "All Dates";

    }


    try {

        const parts =
            dateString.split("-");

        if (parts.length !== 3) {

            return dateString;

        }


        const year =
            Number(parts[0]);

        const month =
            Number(parts[1]);

        const day =
            Number(parts[2]);


        const date =
            new Date(
                Date.UTC(
                    year,
                    month - 1,
                    day
                )
            );


        return new Intl.DateTimeFormat(
            "en-IN",
            {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC"
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


        if (
            userError ||
            !user
        ) {

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


    if (
        email &&
        !errorMessage
    ) {

        email.focus();

    }


    isAdminAuthenticated =
        false;

}


// ============================================================
// SHOW ADMIN DASHBOARD
// ============================================================

async function showAdminDashboard() {

    if (dashboardLoadInProgress) {

        return;

    }


    dashboardLoadInProgress =
        true;


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


        if (
            loggedInAdmin &&
            user
        ) {

            loggedInAdmin.textContent =
                "Signed in as: " +
                (
                    user.email ||
                    "Administrator"
                );

        }


        isAdminAuthenticated =
            true;


        await loadParticipants();


        await restoreCurrentScopeWinner();


        await loadDrawHistory();


        startParticipantRealtime();

    } finally {

        dashboardLoadInProgress =
            false;

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
        emailInput?.value.trim() ||
        "";

    const password =
        passwordInput?.value ||
        "";


    if (loginError) {

        loginError.textContent =
            "";

    }


    if (
        !email ||
        !password
    ) {

        if (loginError) {

            loginError.textContent =
                "Please enter your email and password.";

        }

        return;

    }


    if (loginButton) {

        loginButton.disabled =
            true;

        loginButton.textContent =
            "Signing in...";

    }


    try {

        console.log(
            "Attempting Supabase login..."
        );


        const {
            data,
            error
        } =
            await supabaseClient.auth
                .signInWithPassword({
                    email,
                    password
                });


        if (error) {

            console.error(
                "SUPABASE LOGIN ERROR:",
                error
            );


            if (loginError) {

                loginError.textContent =
                    "Invalid email or password.";

            }

            return;

        }


        if (!data?.user) {

            if (loginError) {

                loginError.textContent =
                    "Unable to verify your account.";

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
            "LOGIN EXCEPTION:",
            error
        );


        if (loginError) {

            loginError.textContent =
                "Unable to login. Please try again.";

        }

    } finally {

        if (loginButton) {

            loginButton.disabled =
                false;

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


    isAdminAuthenticated =
        false;

    allParticipants =
        [];

    currentParticipants =
        [];

    allDrawHistory =
        [];


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

        participantList.innerHTML =
            "";

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


    allParticipants =
        participants;


    // --------------------------------------------------------
    // Build date tabs automatically from created_at
    // --------------------------------------------------------

    buildDrawScopeTabs(
        participants
    );


    // --------------------------------------------------------
    // Show selected scope
    // --------------------------------------------------------

    renderCurrentScope();

}


// ============================================================
// BUILD DRAW SCOPE TABS
// ============================================================

function buildDrawScopeTabs(
    participants
) {

    const tabsContainer =
        getElement(
            "drawScopeTabs"
        );


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


    if (
        currentDrawScope !== "all" &&
        !availableDrawDates.includes(
            currentDrawScope
        )
    ) {

        currentDrawScope =
            "all";

    }


    tabsContainer.innerHTML =
        "";


    // --------------------------------------------------------
    // ALL DATES
    // --------------------------------------------------------

    const allButton =
        document.createElement(
            "button"
        );


    allButton.type =
        "button";

    allButton.className =
        "draw-scope-tab";

    allButton.dataset.scope =
        "all";

    allButton.textContent =
        "Draw All Dates";


    allButton.setAttribute(
        "role",
        "tab"
    );


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
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "draw-scope-tab";


            button.dataset.scope =
                dateString;


            button.textContent =
                formatDateForDisplay(
                    dateString
                );


            button.setAttribute(
                "role",
                "tab"
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
// UPDATE DRAW SCOPE ACTIVE TAB
// ============================================================

function updateDrawScopeTabActiveState() {

    const tabsContainer =
        getElement(
            "drawScopeTabs"
        );


    if (!tabsContainer) {

        return;

    }


    const buttons =
        tabsContainer.querySelectorAll(
            ".draw-scope-tab"
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


            button.setAttribute(
                "aria-selected",
                isActive
                    ? "true"
                    : "false"
            );

        }
    );

}


// ============================================================
// SELECT DRAW SCOPE
// ============================================================

async function selectDrawScope(
    scope
) {

    currentDrawScope =
        scope || "all";


    const searchInput =
        getElement(
            "searchInput"
        );


    if (searchInput) {

        searchInput.value =
            "";

    }


    updateDrawScopeTabActiveState();


    renderCurrentScope();


    await restoreCurrentScopeWinner();

}


// ============================================================
// GET PARTICIPANTS FOR SCOPE
// ============================================================

function getParticipantsForScope(
    participants,
    scope
) {

    if (
        !participants ||
        !participants.length
    ) {

        return [];

    }


    if (
        !scope ||
        scope === "all"
    ) {

        return participants;

    }


    return participants.filter(
        function(participant) {

            return (
                getIndiaDateFromTimestamp(
                    participant.created_at
                ) === scope
            );

        }
    );

}


// ============================================================
// GET CURRENT SCOPE PARTICIPANTS
// ============================================================

function getParticipantsForCurrentScope() {

    return getParticipantsForScope(
        allParticipants,
        currentDrawScope
    );

}


// ============================================================
// RENDER CURRENT SCOPE
// ============================================================

function renderCurrentScope() {

    currentParticipants =
        getParticipantsForCurrentScope();


    displayParticipants(
        currentParticipants
    );


    updateParticipantCount(
        currentParticipants
    );


    updateSelectedScopeUI(
        currentParticipants
    );


}


// ============================================================
// UPDATE SELECTED SCOPE UI
// ============================================================

function updateSelectedScopeUI(
    participants
) {

    const selectedDrawScope =
        getElement(
            "selectedDrawScope"
        );


    if (selectedDrawScope) {

        const scopeText =
            currentDrawScope === "all"
                ? "Draw All Dates"
                : formatDateForDisplay(
                    currentDrawScope
                );


        selectedDrawScope.innerHTML =
            `
                Selected:
                <strong>
                    ${escapeHTML(scopeText)}
                </strong>
            `;

    }


    const selectedScopeCount =
        getElement(
            "selectedScopeCount"
        );


    if (selectedScopeCount) {

        selectedScopeCount.innerHTML =
            `
                Participants in selected scope:
                <strong>
                    ${participants.length}
                </strong>
            `;

    }

}


// ============================================================
// PARTICIPANT COUNT
// ============================================================

function updateParticipantCount(
    participants
) {

    const countElement =
        getElement(
            "participantCount"
        );


    if (countElement) {

        countElement.textContent =
            participants.length;

    }


    const selectedScopeCount =
        getElement(
            "selectedScopeCount"
        );


    if (selectedScopeCount) {

        selectedScopeCount.innerHTML =
            `
                Participants in selected scope:
                <strong>
                    ${participants.length}
                </strong>
            `;

    }

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


                    // History is not affected by a participant
                    // registration, but refreshing its dates here
                    // keeps the interface current if required.
                    if (
                        document
                            .getElementById(
                                "drawHistorySection"
                            )
                            ?.classList.contains(
                                "active-admin-section"
                            )
                    ) {

                        await loadDrawHistory();

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


// ============================================================
// STOP REALTIME
// ============================================================

async function stopParticipantRealtime() {

    if (
        !participantRealtimeChannel
    ) {

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


    if (
        !participants ||
        !participants.length
    ) {

        participantList.innerHTML =
            `
                <tr>
                    <td
                        colspan="7"
                        class="no-data"
                    >
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


            participantList.innerHTML +=
                `
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


    if (!searchValue) {

        renderCurrentScope();

        return;

    }


    const filtered =
        currentParticipants.filter(
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
                        ) ||

                    String(
                        participant.phone ||
                        ""
                    )
                        .toLowerCase()
                        .includes(
                            searchValue
                        ) ||

                    String(
                        participant.registration_id ||
                        ""
                    )
                        .toLowerCase()
                        .includes(
                            searchValue
                        ) ||

                    String(
                        participant.area ||
                        ""
                    )
                        .toLowerCase()
                        .includes(
                            searchValue
                        ) ||

                    String(
                        participant.city ||
                        ""
                    )
                        .toLowerCase()
                        .includes(
                            searchValue
                        ) ||

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
// SEARCH PARTICIPANTS
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
// DRAW FUNCTION CALL
// ============================================================

async function callDrawFunction(
    action
) {

    if (!isAdminAuthenticated) {

        return {
            success: false,
            error:
                "Administrator authentication is required."
        };

    }


    try {

        const {
            data: {
                session
            }
        } =
            await supabaseClient.auth.getSession();


        if (
            !session ||
            !session.access_token
        ) {

            return {
                success: false,
                error:
                    "Your admin session has expired. Please log in again."
            };

        }


        console.log(
            "Calling draw-winner function:",
            {
                action,
                draw_scope:
                    currentDrawScope
            }
        );


        const response =
            await fetch(
                DRAW_FUNCTION_URL,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${session.access_token}`,

                        "apikey":
                            SUPABASE_KEY
                    },

                    body:
                        JSON.stringify({
                            action,
                            draw_scope:
                                currentDrawScope
                        })
                }
            );


        const responseText =
            await response.text();


        let result;


        try {

            result =
                JSON.parse(
                    responseText
                );

        } catch {

            result = {
                success: false,
                error:
                    "The draw service returned an invalid response."
            };

        }


        if (!response.ok) {

            console.error(
                "Draw function HTTP error:",
                response.status,
                result
            );


            return {
                success: false,
                error:
                    result?.error ||
                    `Draw service returned HTTP ${response.status}.`
            };

        }


        return (
            result || {
                success: false,
                error:
                    "No response received from draw service."
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
// RESTORE CURRENT SCOPE WINNER
// ============================================================

async function restoreCurrentScopeWinner() {

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


    winnerResult.innerHTML =
        `
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
        currentDrawScope === "all"
            ? "all participants"
            : formatDateForDisplay(
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


// ============================================================
// CLOSE DRAW MODAL
// ============================================================

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

    if (!isAdminAuthenticated) {

        return;

    }


    const participants =
        getParticipantsForCurrentScope();


    currentParticipants =
        participants;


    updateParticipantCount(
        participants
    );


    if (
        participants.length <
        3
    ) {

        alert(
            currentDrawScope === "all"

                ? "At least 3 participants are required for a 3-winner lucky draw."

                : `At least 3 participants registered on ${formatDateForDisplay(currentDrawScope)} are required for a 3-winner lucky draw.`
        );

        return;

    }


    const status =
        await callDrawFunction(
            "status"
        );


    if (
        !status ||
        !status.success
    ) {

        alert(
            status?.error ||
            "Unable to check the current draw."
        );

        return;

    }


    if (
        status.completed
    ) {

        alert(
            `The draw for ${
                currentDrawScope === "all"
                    ? "All Dates"
                    : formatDateForDisplay(
                        currentDrawScope
                    )
            } has already been completed. Reset this draw before selecting new winners.`
        );


        displayWinners(
            status.winners || []
        );


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


        displayWinners(
            result.winners || []
        );


        renderCurrentScope();


        await restoreCurrentScopeWinner();


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


    if (!winnerResult) {

        return;

    }


    if (
        !Array.isArray(
            winners
        ) ||
        !winners.length
    ) {

        showNoWinner();

        return;

    }


    const medals =
        [
            "🥇",
            "🥈",
            "🥉"
        ];


    winnerResult.innerHTML =
        winners
            .slice(
                0,
                3
            )
            .map(
                function(
                    winner,
                    index
                ) {

                    const registrationId =
                        winner.registration_id ||
                        winner.id ||
                        "-";


                    return `
                        <div>

                            <h3>
                                ${medals[index] || "🏅"}
                                WINNER ${index + 1}
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
            )
            .join("");

}


// ============================================================
// RESET DRAW
// ============================================================

function resetDraw() {

    if (!isAdminAuthenticated) {

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


        closeResetModal();


        showNoWinner();


        await restoreCurrentScopeWinner();


        const scopeText =
            currentDrawScope === "all"
                ? "Draw All Dates"
                : formatDateForDisplay(
                    currentDrawScope
                );


        alert(
            `The draw for ${scopeText} has been reset successfully. Draw history was preserved.`
        );


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
// PARTICIPANT EXCEL
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
        typeof XLSX === "undefined"
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
                        )

                };

            }
        );


    const worksheet =
        XLSX.utils.json_to_sheet(
            excelData
        );


    worksheet["!cols"] =
        [
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
// ============================================================
// DRAW HISTORY
// ============================================================
// ============================================================
//
// IMPORTANT:
//
// This section is the ONLY major area changed for the
// history-date-tab requirement.
//
// It does NOT change:
// - Participant data
// - Participant Excel
// - Draw Winner
// - Reset Draw
// - Draw scope logic
// - Authentication
//
// It simply groups the existing draw_history records by
// draw_date and creates date tabs.
// ============================================================


// ============================================================
// CREATE HISTORY TAB CONTAINER
// ============================================================

function ensureHistoryDateTabsUI() {

    const historySection =
        getElement(
            "drawHistorySection"
        );


    if (!historySection) {

        return null;

    }


    let tabsContainer =
        getElement(
            "historyDateTabs"
        );


    if (tabsContainer) {

        return tabsContainer;

    }


    // --------------------------------------------------------
    // Find a sensible place above the history table.
    // --------------------------------------------------------

    const historyTableCard =
        historySection.querySelector(
            ".history-table-card"
        );


    const historyTableContainer =
        historySection.querySelector(
            ".history-table-container"
        );


    if (!historyTableCard) {

        console.warn(
            "History table card was not found."
        );

        return null;

    }


    tabsContainer =
        document.createElement(
            "div"
        );


    tabsContainer.id =
        "historyDateTabs";


    tabsContainer.className =
        "history-date-tabs";


    tabsContainer.setAttribute(
        "role",
        "tablist"
    );


    tabsContainer.setAttribute(
        "aria-label",
        "Draw history dates"
    );


    const selectedDate =
        document.createElement(
            "div"
        );


    selectedDate.id =
        "selectedHistoryDate";


    selectedDate.className =
        "selected-history-date";


    selectedDate.innerHTML =
        "No draw date selected.";


    // --------------------------------------------------------
    // Insert before the history table container.
    // --------------------------------------------------------

    if (historyTableContainer) {

        historyTableContainer.parentNode.insertBefore(
            tabsContainer,
            historyTableContainer
        );


        historyTableContainer.parentNode.insertBefore(
            selectedDate,
            historyTableContainer
        );

    } else {

        historyTableCard.appendChild(
            tabsContainer
        );


        historyTableCard.appendChild(
            selectedDate
        );

    }


    return tabsContainer;

}


// ============================================================
// GET UNIQUE HISTORY DATES
// ============================================================

function getUniqueHistoryDates(
    history
) {

    const uniqueDates =
        new Set();


    if (
        !history ||
        !history.length
    ) {

        return [];

    }


    history.forEach(
        function(draw) {

            if (
                draw.draw_date
            ) {

                uniqueDates.add(
                    String(
                        draw.draw_date
                    )
                );

            }

        }
    );


    return Array.from(
        uniqueDates
    )
        .sort()
        .reverse();

}


// ============================================================
// BUILD HISTORY DATE TABS
// ============================================================

function buildHistoryDateTabs(
    history
) {

    const tabsContainer =
        ensureHistoryDateTabsUI();


    if (!tabsContainer) {

        return;

    }


    availableHistoryDates =
        getUniqueHistoryDates(
            history
        );


    // --------------------------------------------------------
    // If currently selected date no longer exists,
    // return to All Draws.
    // --------------------------------------------------------

    if (
        selectedHistoryDate !== "all" &&
        !availableHistoryDates.includes(
            selectedHistoryDate
        )
    ) {

        selectedHistoryDate =
            "all";

    }


    tabsContainer.innerHTML =
        "";


    // ========================================================
    // ALL DRAWS TAB
    // ========================================================

    const allButton =
        document.createElement(
            "button"
        );


    allButton.type =
        "button";


    allButton.className =
        "history-date-tab";


    allButton.dataset.date =
        "all";


    allButton.textContent =
        "All Draws";


    allButton.setAttribute(
        "role",
        "tab"
    );


    allButton.addEventListener(
        "click",
        function() {

            selectHistoryDate(
                "all"
            );

        }
    );


    tabsContainer.appendChild(
        allButton
    );


    // ========================================================
    // DATE TABS
    // ========================================================

    availableHistoryDates.forEach(
        function(dateString) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "history-date-tab";


            button.dataset.date =
                dateString;


            button.textContent =
                formatDateForDisplay(
                    dateString
                );


            button.setAttribute(
                "role",
                "tab"
            );


            button.addEventListener(
                "click",
                function() {

                    selectHistoryDate(
                        dateString
                    );

                }
            );


            tabsContainer.appendChild(
                button
            );

        }
    );


    updateHistoryDateTabActiveState();

}


// ============================================================
// UPDATE HISTORY TAB ACTIVE STATE
// ============================================================

function updateHistoryDateTabActiveState() {

    const tabsContainer =
        getElement(
            "historyDateTabs"
        );


    if (!tabsContainer) {

        return;

    }


    const buttons =
        tabsContainer.querySelectorAll(
            ".history-date-tab"
        );


    buttons.forEach(
        function(button) {

            const isActive =
                button.dataset.date ===
                selectedHistoryDate;


            button.classList.toggle(
                "active",
                isActive
            );


            button.setAttribute(
                "aria-selected",
                isActive
                    ? "true"
                    : "false"
            );

        }
    );

}


// ============================================================
// SELECT HISTORY DATE
// ============================================================

function selectHistoryDate(
    dateString
) {

    selectedHistoryDate =
        dateString || "all";


    updateHistoryDateTabActiveState();


    renderHistoryForSelectedDate();

}


// ============================================================
// UPDATE SELECTED HISTORY DATE UI
// ============================================================

function updateSelectedHistoryDateUI(
    numberOfRecords
) {

    const selectedDateElement =
        getElement(
            "selectedHistoryDate"
        );


    if (!selectedDateElement) {

        return;

    }


    if (
        selectedHistoryDate ===
        "all"
    ) {

        selectedDateElement.innerHTML =
            `
                <strong>
                    All Draws
                </strong>

                <span>
                    ${numberOfRecords}
                    history records
                </span>
            `;

        return;

    }


    selectedDateElement.innerHTML =
        `
            <strong>
                ${escapeHTML(
                    formatDateForDisplay(
                        selectedHistoryDate
                    )
                )}
            </strong>

            <span>
                ${numberOfRecords}
                winner records
            </span>
        `;

}


// ============================================================
// FILTER HISTORY BY SELECTED DATE
// ============================================================

function getHistoryForSelectedDate() {

    if (
        selectedHistoryDate ===
        "all"
    ) {

        return allDrawHistory;

    }


    return allDrawHistory.filter(
        function(draw) {

            return String(
                draw.draw_date ||
                ""
            ) ===
            String(
                selectedHistoryDate
            );

        }
    );

}


// ============================================================
// RENDER SELECTED HISTORY
// ============================================================

function renderHistoryForSelectedDate() {

    const historyList =
        getElement(
            "drawHistoryList"
        );


    if (!historyList) {

        console.error(
            "Draw history table body was not found."
        );

        return;

    }


    const filteredHistory =
        getHistoryForSelectedDate();


    updateSelectedHistoryDateUI(
        filteredHistory.length
    );


    if (
        !filteredHistory.length
    ) {

        historyList.innerHTML =
            `
                <tr>

                    <td
                        colspan="6"
                        class="no-data"
                    >
                        ${
                            selectedHistoryDate ===
                            "all"

                                ? "No draws have been conducted yet."

                                : `No draw was conducted on ${escapeHTML(
                                    formatDateForDisplay(
                                        selectedHistoryDate
                                    )
                                )}.`
                        }
                    </td>

                </tr>
            `;

        return;

    }


    historyList.innerHTML =
        "";


    filteredHistory.forEach(
        function(draw) {

            historyList.innerHTML +=
                `
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


}


// ============================================================
// LOAD DRAW HISTORY
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

        console.error(
            "Draw history table body was not found."
        );

        return;

    }


    ensureHistoryDateTabsUI();


    historyList.innerHTML =
        `
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

        console.log(
            "Loading draw history..."
        );


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


            allDrawHistory =
                [];


            historyList.innerHTML =
                `
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


        allDrawHistory =
            data || [];


        buildHistoryDateTabs(
            allDrawHistory
        );


        renderHistoryForSelectedDate();


        console.log(
            "Draw history loaded successfully:",
            allDrawHistory.length,
            "records"
        );


    } catch (error) {

        console.error(
            "DRAW HISTORY EXCEPTION:",
            error
        );


        allDrawHistory =
            [];


        historyList.innerHTML =
            `
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


    // --------------------------------------------------------
    // LOAD HISTORY ONLY WHEN HISTORY SECTION IS OPENED
    // --------------------------------------------------------

    if (
        sectionId ===
        "drawHistorySection"
    ) {

        loadDrawHistory();

    }

}


// ============================================================
// MAKE INLINE HTML EVENTS ACCESSIBLE
// ============================================================

window.showAdminSection =
    showAdminSection;


window.loadDrawHistory =
    loadDrawHistory;


window.selectDrawScope =
    selectDrawScope;


window.selectHistoryDate =
    selectHistoryDate;


// ============================================================
// DOWNLOAD DRAW HISTORY TO EXCEL
// ============================================================

async function downloadDrawHistory() {

    if (!isAdminAuthenticated) {

        alert(
            "Administrator authentication is required."
        );

        return;

    }


    const downloadButton =
        getElement(
            "downloadHistoryButton"
        );


    const originalHTML =
        downloadButton
            ? downloadButton.innerHTML
            : "📥 Download Excel";


    if (downloadButton) {

        downloadButton.disabled =
            true;

        downloadButton.innerHTML =
            "📄 Preparing Excel...";

    }


    try {

        console.log(
            "Preparing draw history Excel file..."
        );


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
                        ascending: true
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
                "History Excel fetch error:",
                error
            );


            alert(
                "Unable to prepare draw history Excel file."
            );

            return;

        }


        if (
            !data ||
            !data.length
        ) {

            alert(
                "No draw history available to download."
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
            data.map(
                function(
                    draw,
                    index
                ) {

                    return {

                        "No.":
                            index + 1,

                        "Draw No.":
                            draw.draw_number ??
                            "",

                        "Date":
                            draw.draw_date ||
                            "",

                        "Time":
                            draw.draw_time ||
                            "",

                        "Draw Scope":
                            draw.draw_scope ||
                            "all",

                        "Winner":
                            draw.winner_name ||
                            "",

                        "Registration ID":
                            draw.winner_registration_id ||
                            "",

                        "Phone":
                            draw.winner_phone ||
                            ""

                    };

                }
            );


        const worksheet =
            XLSX.utils.json_to_sheet(
                excelData
            );


        worksheet["!cols"] =
            [
                {
                    wch: 8
                },
                {
                    wch: 12
                },
                {
                    wch: 16
                },
                {
                    wch: 14
                },
                {
                    wch: 18
                },
                {
                    wch: 28
                },
                {
                    wch: 22
                },
                {
                    wch: 18
                }
            ];


        const workbook =
            XLSX.utils.book_new();


        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Draw History"
        );


        XLSX.writeFile(
            workbook,
            "Lucky_Draw_History.xlsx"
        );


    } catch (error) {

        console.error(
            "History Excel exception:",
            error
        );


        alert(
            "Unable to download draw history."
        );

    } finally {

        if (downloadButton) {

            downloadButton.disabled =
                false;

            downloadButton.innerHTML =
                originalHTML;

        }

    }

}


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
    // PARTICIPANT EXCEL
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
    // DRAW HISTORY EXCEL
    // --------------------------------------------------------

    const downloadHistoryButton =
        getElement(
            "downloadHistoryButton"
        );


    if (downloadHistoryButton) {

        // Remove any old inline click handler/listener
        // by replacing the button with a clean clone.
        const cleanHistoryButton =
            downloadHistoryButton.cloneNode(
                true
            );


        downloadHistoryButton.parentNode.replaceChild(
            cleanHistoryButton,
            downloadHistoryButton
        );


        cleanHistoryButton.addEventListener(
            "click",
            downloadDrawHistory
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
    // DRAW MODAL
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
    // RESET MODAL
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


        // INITIAL_SESSION is handled by
        // initializeAdmin().

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
            event === "SIGNED_IN" ||
            event === "TOKEN_REFRESHED" ||
            event === "USER_UPDATED"
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
            data: {
                session
            }
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


// ============================================================
// START
// ============================================================

initializeAdmin();
