// ============================================================
// LUCKY DRAW ADMIN DASHBOARD
// SECURE SUPABASE AUTH + DATE-WISE DRAW + DRAW HISTORY
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

let allParticipants = [];

let currentParticipants = [];

let isAdminAuthenticated = false;

let isInitializing = true;

let dashboardLoadInProgress = false;

let authTransitionInProgress = false;


// ------------------------------------------------------------
// CURRENT DRAW SCOPE
// "all" OR "YYYY-MM-DD"
// ------------------------------------------------------------

let currentDrawScope = "all";


// ------------------------------------------------------------
// DRAW MODAL STATE
// ------------------------------------------------------------

let drawAction = "new";


// ============================================================
// DRAW HISTORY STATE
// ============================================================

let allDrawHistory = [];

let selectedHistoryDate = "all";

let selectedHistoryDrawNumber = null;


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

        return "";

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
            "India date conversion error:",
            error
        );

        return "";

    }

}


function formatDrawDate(dateString) {

    if (!dateString) {

        return "-";

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


function formatDateForDisplay(dateString) {

    return formatDrawDate(
        dateString
    );

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


        return (
            data?.user_id ===
            user.id
        );


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
            getElement(
                "loggedInAdmin"
            );


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

        const {
            data,
            error
        } =
            await supabaseClient.auth.signInWithPassword(
                {
                    email,
                    password
                }
            );


        if (
            error ||
            !data?.user
        ) {

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
        getElement(
            "participantList"
        );


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
// DATE-WISE PARTICIPANT FILTER
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

        return [
            ...participants
        ];

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
// CURRENT SCOPE PARTICIPANTS
// ============================================================

function getParticipantsForCurrentScope() {

    return getParticipantsForScope(
        allParticipants,
        currentDrawScope
    );

}


// ============================================================
// GET AVAILABLE DATE SCOPES
// ============================================================

function getAvailableDateScopes(
    participants
) {

    const dates =
        new Set();


    if (
        participants &&
        participants.length
    ) {

        participants.forEach(
            function(participant) {

                const date =
                    getIndiaDateFromTimestamp(
                        participant.created_at
                    );


                if (date) {

                    dates.add(date);

                }

            }
        );

    }


    return Array.from(
        dates
    ).sort(
        function(a, b) {

            return (
                b.localeCompare(a)
            );

        }
    );

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


    const availableDates =
        getAvailableDateScopes(
            allParticipants
        );


    if (
        currentDrawScope !== "all" &&
        !availableDates.includes(
            currentDrawScope
        )
    ) {

        currentDrawScope =
            "all";

    }


    renderDrawScopeTabs();


    renderCurrentScope();


    await restoreCurrentScopeWinner();

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
                : formatDrawDate(
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
// DATE TAB UI
// ============================================================

function renderDrawScopeTabs() {

    const tabsContainer =
        getElement(
            "drawScopeTabs"
        );


    if (!tabsContainer) {

        return;

    }


    tabsContainer.innerHTML =
        "";


    const allButton =
        document.createElement(
            "button"
        );


    allButton.type =
        "button";


    allButton.className =
        "draw-scope-tab" +
        (
            currentDrawScope === "all"
                ? " active"
                : ""
        );


    allButton.textContent =
        "Draw All Dates";


    allButton.setAttribute(
        "role",
        "tab"
    );


    allButton.setAttribute(
        "aria-selected",
        currentDrawScope === "all"
            ? "true"
            : "false"
    );


    allButton.addEventListener(
        "click",
        async function() {

            await selectDrawScope(
                "all"
            );

        }
    );


    tabsContainer.appendChild(
        allButton
    );


    const dates =
        getAvailableDateScopes(
            allParticipants
        );


    dates.forEach(
        function(dateKey) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "draw-scope-tab" +
                (
                    currentDrawScope ===
                    dateKey
                        ? " active"
                        : ""
                );


            button.textContent =
                formatDateForDisplay(
                    dateKey
                );


            button.setAttribute(
                "role",
                "tab"
            );


            button.setAttribute(
                "aria-selected",
                currentDrawScope ===
                    dateKey
                    ? "true"
                    : "false"
            );


            button.addEventListener(
                "click",
                async function() {

                    await selectDrawScope(
                        dateKey
                    );

                }
            );


            tabsContainer.appendChild(
                button
            );

        }
    );

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

        displayParticipants(
            currentParticipants
        );


        updateParticipantCount(
            currentParticipants
        );


        return;

    }


    const filtered =
        currentParticipants.filter(
            function(participant) {

                const source =
                    getProfessionalSource(
                        participant
                    ).toLowerCase();


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


async function searchParticipants() {

    await performSearch();

}


function clearSearchInput() {

    const searchInput =
        getElement(
            "searchInput"
        );


    if (searchInput) {

        searchInput.value =
            "";

    }

}


async function clearSearch() {

    clearSearchInput();


    renderCurrentScope();

}


// ============================================================
// SOURCE LABEL
// ============================================================

function getProfessionalSource(
    participant
) {

    const rawSource =
        String(
            participant?.source ||
            ""
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
// DRAW EDGE FUNCTION
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
            data,
            error
        } =
            await supabaseClient.functions.invoke(
                "draw-winner",
                {
                    body: {
                        action:
                            action,

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


            return {
                success: false,
                error:
                    error.message ||
                    "Unable to communicate with draw service."
            };

        }


        return (
            data || {
                success: false,
                error:
                    "Empty response from draw service."
            }
        );


    } catch (error) {

        console.error(
            "Draw Edge Function exception:",
            error
        );


        return {
            success: false,
            error:
                "Unable to communicate with draw service."
        };

    }

}


// ============================================================
// CURRENT DRAW STATUS
// ============================================================

async function getCurrentDrawStatus() {

    return await callDrawFunction(
        "status"
    );

}


// ============================================================
// RESTORE CURRENT SCOPE WINNER
// ============================================================

async function restoreCurrentScopeWinner() {

    if (!isAdminAuthenticated) {

        return;

    }


    try {

        const result =
            await getCurrentDrawStatus();


        if (
            result &&
            result.success &&
            result.completed
        ) {

            displayWinners(
                result.winners || []
            );


        } else {

            displayWinners([]);

        }


    } catch (error) {

        console.error(
            "Restore current scope winner error:",
            error
        );

    }

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


    drawAction =
        "new";


    const scopeText =
        currentDrawScope ===
            "all"

            ? "All Dates"

            : formatDateForDisplay(
                currentDrawScope
            );


    if (message) {

        message.textContent =
            `Are you sure you want to draw 3 winners for ${scopeText}?`;

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
// DRAW WINNER
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
            currentDrawScope ===
                "all"

                ? "At least 3 participants are required for a 3-winner lucky draw."

                : `At least 3 participants registered on ${formatDateForDisplay(currentDrawScope)} are required for a 3-winner lucky draw.`
        );


        return;

    }


    const status =
        await getCurrentDrawStatus();


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

        const scopeText =
            currentDrawScope ===
                "all"

                ? "All Dates"

                : formatDateForDisplay(
                    currentDrawScope
                );


        alert(
            `The draw for ${scopeText} has already been completed. Reset this draw before selecting new winners.`
        );


        displayWinners(
            status.winners ||
            []
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


    const drawButton =
        getElement(
            "drawWinnerButton"
        );


    if (drawButton) {

        drawButton.disabled =
            true;

        drawButton.textContent =
            "🎲 Drawing...";

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
            result.winners ||
            []
        );


        await loadDrawHistory();


    } catch (error) {

        console.error(
            "Draw confirmation error:",
            error
        );


        alert(
            "An error occurred while drawing the winners."
        );


    } finally {

        if (drawButton) {

            drawButton.disabled =
                false;

            drawButton.textContent =
                "🎲 Draw Winner";

        }

    }

}


// ============================================================
// DISPLAY MULTIPLE WINNERS
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
        !winners ||
        !winners.length
    ) {

        winnerResult.innerHTML =
            `
                <p>
                    No winner selected yet.
                </p>
            `;

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


                const card =
                    document.createElement(
                        "div"
                    );


                card.style.cssText =
                    `
                        min-width:0;
                        padding:18px;
                        border:1px solid #e5e7eb;
                        border-radius:18px;
                        background:#ffffff;
                        box-sizing:border-box;
                        overflow:hidden;
                    `;


                card.innerHTML =
                    `
                        <h3
                            style="
                                margin:0 0 14px;
                                color:#f43f5e;
                                font-size:23px;
                                line-height:1.2;
                            "
                        >
                            🥇 WINNER ${winnerNumber}
                        </h3>

                        <p
                            style="
                                margin:7px 0;
                                font-size:15px;
                                line-height:1.4;
                                overflow-wrap:anywhere;
                            "
                        >
                            <strong
                                style="
                                    color:#172554;
                                "
                            >
                                Registration ID:
                            </strong>
                            ${escapeHTML(
                                registrationId
                            )}
                        </p>

                        <p
                            style="
                                margin:7px 0;
                                font-size:15px;
                                line-height:1.4;
                                overflow-wrap:anywhere;
                            "
                        >
                            <strong
                                style="
                                    color:#172554;
                                "
                            >
                                Name:
                            </strong>
                            ${escapeHTML(
                                winner.name ||
                                "-"
                            )}
                        </p>

                        <p
                            style="
                                margin:7px 0;
                                font-size:15px;
                                line-height:1.4;
                                overflow-wrap:anywhere;
                            "
                        >
                            <strong
                                style="
                                    color:#172554;
                                "
                            >
                                Phone:
                            </strong>
                            ${escapeHTML(
                                winner.phone ||
                                "-"
                            )}
                        </p>

                        <p
                            style="
                                margin:7px 0;
                                font-size:15px;
                                line-height:1.4;
                                overflow-wrap:anywhere;
                            "
                        >
                            <strong
                                style="
                                    color:#172554;
                                "
                            >
                                Area:
                            </strong>
                            ${escapeHTML(
                                winner.area ||
                                "-"
                            )}
                        </p>

                        <p
                            style="
                                margin:7px 0;
                                font-size:15px;
                                line-height:1.4;
                                overflow-wrap:anywhere;
                            "
                        >
                            <strong
                                style="
                                    color:#172554;
                                "
                            >
                                City:
                            </strong>
                            ${escapeHTML(
                                winner.city ||
                                "-"
                            )}
                        </p>
                    `;


                winnerResult.appendChild(
                    card
                );

            }
        );

}


// ============================================================
// RESET DRAW
// ============================================================

async function resetDraw() {

    if (!isAdminAuthenticated) {

        return;

    }


    const status =
        await getCurrentDrawStatus();


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
        !status.completed
    ) {

        alert(
            currentDrawScope ===
                "all"

                ? "There is no completed draw to reset."

                : `There is no completed draw for ${formatDateForDisplay(currentDrawScope)} to reset.`
        );


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
// CONFIRM RESET
// ============================================================

async function confirmResetDraw() {

    closeResetModal();


    const resetButton =
        getElement(
            "confirmResetButton"
        );


    if (resetButton) {

        resetButton.disabled =
            true;

        resetButton.textContent =
            "🔄 Resetting...";

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
                "Unable to reset the lucky draw."
            );


            return;

        }


        displayWinners([]);


        await loadDrawHistory();


        const scopeText =
            currentDrawScope ===
                "all"

                ? "Draw All Dates"

                : formatDrawDate(
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
            "An error occurred while resetting the draw."
        );


    } finally {

        if (resetButton) {

            resetButton.disabled =
                false;

            resetButton.textContent =
                "🔄 Reset Draw";

        }

    }

}


// ============================================================
// EXCEL - PARTICIPANTS
// ============================================================

async function downloadParticipants() {

    const participants =
        await getParticipants();


    if (
        !participants.length
    ) {

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
// DRAW HISTORY
// ============================================================


// ------------------------------------------------------------
// ENSURE HISTORY CONTAINERS
// ------------------------------------------------------------

function ensureHistoryContainers() {

    const historySection =
        getElement(
            "drawHistorySection"
        );


    if (!historySection) {

        return null;

    }


    let historyNavigation =
        getElement(
            "drawHistoryNavigation"
        );


    if (!historyNavigation) {

        historyNavigation =
            document.createElement(
                "div"
            );


        historyNavigation.id =
            "drawHistoryNavigation";


        historyNavigation.style.cssText =
            `
                width:100%;
                box-sizing:border-box;
                margin-bottom:25px;
            `;


        const historyList =
            getElement(
                "drawHistoryList"
            );


        if (
            historyList &&
            historyList.closest("table")
        ) {

            historyList
                .closest("table")
                .parentElement
                .insertBefore(
                    historyNavigation,
                    historyList
                        .closest("table")
                );

        } else {

            historySection.appendChild(
                historyNavigation
            );

        }

    }


    // --------------------------------------------------------
    // DATE TABS
    // --------------------------------------------------------

    let dateTabs =
        getElement(
            "drawHistoryDateTabs"
        );


    if (!dateTabs) {

        dateTabs =
            document.createElement(
                "div"
            );


        dateTabs.id =
            "drawHistoryDateTabs";


        dateTabs.style.cssText =
            `
                display:flex;
                flex-wrap:wrap;
                gap:10px;
                margin-bottom:18px;
            `;


        historyNavigation.appendChild(
            dateTabs
        );

    }


    // --------------------------------------------------------
    // DRAW TABS
    // --------------------------------------------------------

    let drawTabs =
        getElement(
            "drawHistoryDrawTabs"
        );


    if (!drawTabs) {

        drawTabs =
            document.createElement(
                "div"
            );


        drawTabs.id =
            "drawHistoryDrawTabs";


        drawTabs.style.cssText =
            `
                display:flex;
                flex-wrap:wrap;
                gap:10px;
                margin-bottom:20px;
            `;


        historyNavigation.appendChild(
            drawTabs
        );

    }


    // --------------------------------------------------------
    // SUMMARY
    // --------------------------------------------------------

    let summary =
        getElement(
            "drawHistorySummary"
        );


    if (!summary) {

        summary =
            document.createElement(
                "div"
            );


        summary.id =
            "drawHistorySummary";


        summary.style.cssText =
            `
                width:100%;
                box-sizing:border-box;
                padding:15px 18px;
                margin-bottom:18px;
                background:#f8fafc;
                border:1px solid #e5e7eb;
                border-radius:15px;
                color:#172554;
                font-size:16px;
                font-weight:600;
            `;


        historyNavigation.appendChild(
            summary
        );

    }


    // --------------------------------------------------------
    // WINNERS CONTAINER
    // --------------------------------------------------------

    let winnersContainer =
        getElement(
            "drawHistoryWinners"
        );


    if (!winnersContainer) {

        winnersContainer =
            document.createElement(
                "div"
            );


        winnersContainer.id =
            "drawHistoryWinners";


        winnersContainer.style.cssText =
            `
                width:100%;
                display:grid;
                grid-template-columns:repeat(3,minmax(0,1fr));
                gap:16px;
                box-sizing:border-box;
                margin-top:10px;
            `;


        historyNavigation.appendChild(
            winnersContainer
        );

    }


    // --------------------------------------------------------
    // MOBILE RESPONSIVENESS
    // --------------------------------------------------------

    if (
        !document.getElementById(
            "drawHistoryResponsiveStyle"
        )
    ) {

        const style =
            document.createElement(
                "style"
            );


        style.id =
            "drawHistoryResponsiveStyle";


        style.textContent =
            `
                @media (max-width:700px) {

                    #drawHistoryWinners {
                        grid-template-columns:1fr !important;
                    }

                    #drawHistoryDateTabs,
                    #drawHistoryDrawTabs {
                        gap:8px !important;
                    }

                }

                #drawHistoryDateTabs button,
                #drawHistoryDrawTabs button {

                    cursor:pointer;
                    padding:12px 20px;
                    border-radius:15px;
                    border:1px solid #d7deeb;
                    background:#ffffff;
                    color:#172554;
                    font-size:16px;
                    font-weight:700;
                    transition:all 0.2s ease;

                }

                #drawHistoryDateTabs button:hover,
                #drawHistoryDrawTabs button:hover {

                    transform:translateY(-1px);
                    box-shadow:
                        0 5px 14px
                        rgba(0,0,0,0.08);

                }

                #drawHistoryDateTabs button.active,
                #drawHistoryDrawTabs button.active {

                    background:
                        linear-gradient(
                            135deg,
                            #2563eb,
                            #ec4899
                        );

                    color:#ffffff;
                    border-color:#2563eb;

                    box-shadow:
                        0 7px 18px
                        rgba(37,99,235,0.20);

                }

                #drawHistoryWinners > div {

                    min-width:0;
                    padding:22px;

                    border:
                        1px solid #e5e7eb;

                    border-radius:18px;

                    background:#ffffff;

                    box-sizing:border-box;

                    overflow:hidden;

                }

                #drawHistoryWinners h3 {

                    margin:
                        0 0 16px;

                    color:#f43f5e;

                    font-size:24px;

                }

                #drawHistoryWinners p {

                    margin:
                        8px 0;

                    font-size:16px;

                    line-height:1.45;

                    overflow-wrap:anywhere;

                }

                #drawHistoryWinners strong {

                    color:#172554;

                }

                #drawHistorySummary {

                    display:flex;

                    flex-wrap:wrap;

                    gap:8px;

                    align-items:center;

                }

            `;


        document.head.appendChild(
            style
        );

    }


    return historyNavigation;

}


// ============================================================
// GET HISTORY DATES
// ============================================================

function getHistoryDates() {

    const dates =
        new Set();


    allDrawHistory.forEach(
        function(item) {

            const date =
                String(
                    item.draw_date ||
                    ""
                ).trim();


            if (date) {

                dates.add(date);

            }

        }
    );


    return Array.from(
        dates
    ).sort(
        function(a, b) {

            return b.localeCompare(a);

        }
    );

}


// ============================================================
// GET HISTORY FOR DATE
// ============================================================

function getHistoryForSelectedDate() {

    if (
        selectedHistoryDate ===
        "all"
    ) {

        return [
            ...allDrawHistory
        ];

    }


    return allDrawHistory.filter(
        function(draw) {

            return (
                String(
                    draw.draw_date ||
                    ""
                ) ===
                String(
                    selectedHistoryDate
                )
            );

        }
    );

}


// ============================================================
// GET DRAW GROUPS FOR SELECTED DATE
// ============================================================

function getHistoryDrawGroups(
    historyRows
) {

    const groups =
        new Map();


    historyRows.forEach(
        function(row) {

            const globalDrawNumber =
                String(
                    row.draw_number ??
                    ""
                );


            if (!groups.has(
                globalDrawNumber
            )) {

                groups.set(
                    globalDrawNumber,
                    []
                );

            }


            groups.get(
                globalDrawNumber
            ).push(
                row
            );

        }
    );


    /*
     * IMPORTANT:
     *
     * The database keeps the real global draw_number.
     *
     * The History page creates a LOCAL number
     * starting from 1 for every selected date.
     *
     * Example:
     *
     * 4 September:
     * global draws = 39, 40, 41, 42
     *
     * History displays:
     * Draw 1, Draw 2, Draw 3, Draw 4
     *
     * The actual global number is still preserved
     * internally so the correct winners are shown.
     */


    const groupsArray =
        Array.from(
            groups.entries()
        ).map(
            function(
                entry
            ) {

                return {

                    globalDrawNumber:
                        entry[0],

                    records:
                        entry[1]

                };

            }
        );


    groupsArray.sort(
        function(a, b) {

            const numberA =
                Number(
                    a.globalDrawNumber
                );

            const numberB =
                Number(
                    b.globalDrawNumber
                );


            if (
                Number.isFinite(
                    numberA
                ) &&
                Number.isFinite(
                    numberB
                )
            ) {

                return (
                    numberA -
                    numberB
                );

            }


            return String(
                a.globalDrawNumber
            ).localeCompare(
                String(
                    b.globalDrawNumber
                )
            );

        }
    );


    return groupsArray;

}


// ============================================================
// RENDER HISTORY DATE TABS
// ============================================================

function renderHistoryDateTabs() {

    const tabsContainer =
        getElement(
            "drawHistoryDateTabs"
        );


    if (!tabsContainer) {

        return;

    }


    tabsContainer.innerHTML =
        "";


    const dates =
        getHistoryDates();


    // --------------------------------------------------------
    // ALL DRAWS TAB
    // --------------------------------------------------------

    if (dates.length > 0) {

        const allButton =
            document.createElement(
                "button"
            );


        allButton.type =
            "button";


        allButton.textContent =
            "All Dates";


        allButton.className =
            selectedHistoryDate ===
                "all"
                ? "active"
                : "";


        allButton.setAttribute(
            "role",
            "tab"
        );


        allButton.setAttribute(
            "aria-selected",
            selectedHistoryDate ===
                "all"
                ? "true"
                : "false"
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

    }


    // --------------------------------------------------------
    // DATE TABS
    // --------------------------------------------------------

    dates.forEach(
        function(dateString) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.textContent =
                formatDateForDisplay(
                    dateString
                );


            button.className =
                selectedHistoryDate ===
                    dateString
                    ? "active"
                    : "";


            button.dataset.date =
                dateString;


            button.setAttribute(
                "role",
                "tab"
            );


            button.setAttribute(
                "aria-selected",
                selectedHistoryDate ===
                    dateString
                    ? "true"
                    : "false"
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

}


// ============================================================
// RENDER HISTORY DRAW TABS
// ============================================================

function renderHistoryDrawTabs() {

    const drawTabs =
        getElement(
            "drawHistoryDrawTabs"
        );


    if (!drawTabs) {

        return;

    }


    drawTabs.innerHTML =
        "";


    const selectedDateHistory =
        getHistoryForSelectedDate();


    const drawGroups =
        getHistoryDrawGroups(
            selectedDateHistory
        );


    if (!drawGroups.length) {

        selectedHistoryDrawNumber =
            null;


        return;

    }


    /*
     * If no draw is selected, select the newest
     * draw for the current date.
     *
     * Because groups are sorted oldest -> newest,
     * the last group is the newest draw.
     */


    const selectedStillExists =
        drawGroups.some(
            function(group) {

                return (
                    String(
                        group.globalDrawNumber
                    ) ===
                    String(
                        selectedHistoryDrawNumber
                    )
                );

            }
        );


    if (
        selectedHistoryDrawNumber ===
            null ||
        !selectedStillExists
    ) {

        selectedHistoryDrawNumber =
            drawGroups[
                drawGroups.length - 1
            ].globalDrawNumber;

    }


    drawGroups.forEach(
        function(
            group,
            index
        ) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            /*
             * THIS IS THE IMPORTANT FIX.
             *
             * index + 1 is the local draw number
             * for the selected date.
             */


            const localDrawNumber =
                index + 1;


            button.textContent =
                `Draw ${localDrawNumber}`;


            button.dataset.globalDrawNumber =
                group.globalDrawNumber;


            button.dataset.localDrawNumber =
                String(
                    localDrawNumber
                );


            button.className =
                String(
                    group.globalDrawNumber
                ) ===
                String(
                    selectedHistoryDrawNumber
                )
                    ? "active"
                    : "";


            button.addEventListener(
                "click",
                function() {

                    selectHistoryDraw(
                        group.globalDrawNumber
                    );

                }
            );


            drawTabs.appendChild(
                button
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


    /*
     * Reset the selected draw so the newest draw
     * for the newly selected date becomes active.
     */

    selectedHistoryDrawNumber =
        null;


    renderHistoryDateTabs();


    renderHistoryDrawTabs();


    renderHistoryWinners();


    updateHistorySummary();

}


// ============================================================
// SELECT HISTORY DRAW
// ============================================================

function selectHistoryDraw(
    globalDrawNumber
) {

    selectedHistoryDrawNumber =
        globalDrawNumber;


    renderHistoryDrawTabs();


    renderHistoryWinners();


    updateHistorySummary();

}


// ============================================================
// GET SELECTED HISTORY DRAW RECORDS
// ============================================================

function getSelectedHistoryDrawRecords() {

    const selectedDateHistory =
        getHistoryForSelectedDate();


    if (
        selectedHistoryDrawNumber ===
        null
    ) {

        return [];

    }


    return selectedDateHistory.filter(
        function(row) {

            return (
                String(
                    row.draw_number ??
                    ""
                ) ===
                String(
                    selectedHistoryDrawNumber
                )
            );

        }
    ).sort(
        function(a, b) {

            return (
                Number(a.id || 0) -
                Number(b.id || 0)
            );

        }
    );

}


// ============================================================
// GET LOCAL DRAW NUMBER
// ============================================================

function getLocalHistoryDrawNumber() {

    const selectedDateHistory =
        getHistoryForSelectedDate();


    const drawGroups =
        getHistoryDrawGroups(
            selectedDateHistory
        );


    const index =
        drawGroups.findIndex(
            function(group) {

                return (
                    String(
                        group.globalDrawNumber
                    ) ===
                    String(
                        selectedHistoryDrawNumber
                    )
                );

            }
        );


    if (index === -1) {

        return null;

    }


    return index + 1;

}


// ============================================================
// UPDATE HISTORY SUMMARY
// ============================================================

function updateHistorySummary() {

    const summary =
        getElement(
            "drawHistorySummary"
        );


    if (!summary) {

        return;

    }


    const selectedDateHistory =
        getHistoryForSelectedDate();


    const drawGroups =
        getHistoryDrawGroups(
            selectedDateHistory
        );


    if (!drawGroups.length) {

        if (
            selectedHistoryDate ===
            "all"
        ) {

            summary.innerHTML =
                `
                    No draw history available.
                `;

        } else {

            summary.innerHTML =
                `
                    No draws were conducted on
                    <strong>
                        ${escapeHTML(
                            formatDateForDisplay(
                                selectedHistoryDate
                            )
                        )}
                    </strong>.
                `;

        }


        return;

    }


    const localDrawNumber =
        getLocalHistoryDrawNumber();


    const selectedDateText =
        selectedHistoryDate ===
            "all"

            ? "All Dates"

            : formatDateForDisplay(
                selectedHistoryDate
            );


    if (
        selectedHistoryDate ===
        "all"
    ) {

        summary.innerHTML =
            `
                <strong>
                    All Dates
                </strong>

                <span>
                    •
                </span>

                <span>
                    ${drawGroups.length}
                    total draws
                </span>

                ${
                    localDrawNumber
                        ? `
                            <span>
                                •
                            </span>

                            <span>
                                Showing Draw
                                ${localDrawNumber}
                            </span>
                        `
                        : ""
                }
            `;

    } else {

        summary.innerHTML =
            `
                <strong>
                    ${escapeHTML(
                        selectedDateText
                    )}
                </strong>

                <span>
                    •
                </span>

                <span>
                    ${drawGroups.length}
                    draws
                </span>

                ${
                    localDrawNumber
                        ? `
                            <span>
                                •
                            </span>

                            <span>
                                Showing Draw
                                ${localDrawNumber}
                            </span>
                        `
                        : ""
                }
            `;

    }

}


// ============================================================
// RENDER HISTORY WINNERS
// ============================================================

function renderHistoryWinners() {

    const winnersContainer =
        getElement(
            "drawHistoryWinners"
        );


    if (!winnersContainer) {

        return;

    }


    winnersContainer.innerHTML =
        "";


    const records =
        getSelectedHistoryDrawRecords();


    if (!records.length) {

        return;

    }


    records
        .slice(0, 3)
        .forEach(
            function(
                winner,
                index
            ) {

                const card =
                    document.createElement(
                        "div"
                    );


                const registrationId =
                    winner.winner_registration_id ||
                    "-";


                const winnerNumber =
                    index + 1;


                card.innerHTML =
                    `
                        <h3>
                            🥇 WINNER ${winnerNumber}
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
                                winner.winner_name ||
                                "-"
                            )}
                        </p>

                        <p>
                            <strong>
                                Phone:
                            </strong>
                            ${escapeHTML(
                                winner.winner_phone ||
                                "-"
                            )}
                        </p>
                    `;


                winnersContainer.appendChild(
                    card
                );

            }
        );

}


// ============================================================
// RENDER COMPLETE HISTORY VIEW
// ============================================================

function renderHistoryView() {

    ensureHistoryContainers();


    renderHistoryDateTabs();


    renderHistoryDrawTabs();


    updateHistorySummary();


    renderHistoryWinners();

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


    ensureHistoryContainers();


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

        const {
            data,
            error
        } =
            await supabaseClient
                .from("draw_history")
                .select(
                    `
                        id,
                        draw_number,
                        draw_date,
                        draw_time,
                        draw_scope,
                        winner_name,
                        winner_registration_id,
                        winner_phone
                    `
                )
                .order(
                    "draw_number",
                    {
                        ascending:
                            true
                    }
                )
                .order(
                    "id",
                    {
                        ascending:
                            true
                    }
                );


        if (error) {

            console.error(
                "Draw history error:",
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


            renderHistoryView();


            return;

        }


        allDrawHistory =
            data || [];


        if (
            !allDrawHistory.length
        ) {

            selectedHistoryDate =
                "all";


            selectedHistoryDrawNumber =
                null;


            historyList.innerHTML =
                `
                    <tr>

                        <td
                            colspan="6"
                            class="no-data"
                        >
                            No draws have been conducted yet.
                        </td>

                    </tr>
                `;


            renderHistoryView();


            return;

        }


        /*
         * If the previously selected date no longer exists,
         * return to the newest available date.
         */

        const availableDates =
            getHistoryDates();


        if (
            selectedHistoryDate !==
                "all" &&
            !availableDates.includes(
                selectedHistoryDate
            )
        ) {

            selectedHistoryDate =
                availableDates[0];

            selectedHistoryDrawNumber =
                null;

        }


        /*
         * If this is the first history load,
         * automatically select the newest date.
         */

        if (
            selectedHistoryDate ===
                "all"
        ) {

            selectedHistoryDate =
                availableDates[0];

            selectedHistoryDrawNumber =
                null;

        }


        renderHistoryView();


        /*
         * The old table is no longer needed for the
         * user-facing history display.
         *
         * Keep the table itself in the HTML so nothing
         * else is structurally changed, but hide its rows.
         */

        historyList.innerHTML =
            `
                <tr>
                    <td
                        colspan="6"
                        class="no-data"
                    >
                        Select a draw above to view its winners.
                    </td>
                </tr>
            `;


        console.log(
            "Draw history loaded successfully:",
            allDrawHistory.length,
            "winner records"
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


        renderHistoryView();

    }

}


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


    if (
        typeof XLSX ===
        "undefined"
    ) {

        alert(
            "Excel export library is unavailable. Please try again."
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

        const {
            data,
            error
        } =
            await supabaseClient
                .from("draw_history")
                .select(
                    `
                        draw_number,
                        draw_date,
                        draw_time,
                        draw_scope,
                        winner_name,
                        winner_registration_id,
                        winner_phone
                    `
                )
                .order(
                    "draw_number",
                    {
                        ascending:
                            true
                    }
                )
                .order(
                    "draw_date",
                    {
                        ascending:
                            true
                    }
                );


        if (error) {

            console.error(
                "Draw history download error:",
                error
            );


            alert(
                "Unable to download draw history."
            );


            return;

        }


        if (
            !data ||
            !data.length
        ) {

            alert(
                "There is no draw history available to download."
            );


            return;

        }


        const excelData =
            data.map(
                function(item) {

                    return {

                        "Draw No.":
                            item.draw_number ||
                            "",

                        "Draw Date":
                            item.draw_date ||
                            "",

                        "Draw Time":
                            item.draw_time ||
                            "",

                        "Draw Scope":
                            item.draw_scope ||
                            "all",

                        "Winner":
                            item.winner_name ||
                            "",

                        "Registration ID":
                            item.winner_registration_id ||
                            "",

                        "Phone":
                            item.winner_phone ||
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
                    wch: 12
                },

                {
                    wch: 15
                },

                {
                    wch: 15
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
            "Draw history download exception:",
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
// ADMIN SECTION NAVIGATION
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
// INLINE HTML FUNCTIONS
// ============================================================

window.showAdminSection =
    showAdminSection;


window.loadDrawHistory =
    loadDrawHistory;


window.downloadDrawHistory =
    downloadDrawHistory;


// ============================================================
// REALTIME
// ============================================================

function startParticipantRealtime() {

    if (
        !isAdminAuthenticated
    ) {

        return;

    }


    if (
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
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {

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


// ============================================================
// START
// ============================================================

initializeAdmin();
