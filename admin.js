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

const DRAW_FUNCTION_URL =
    `${SUPABASE_URL}/functions/v1/draw-winner`;

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
// DATE-WISE DRAW STATE
// ------------------------------------------------------------

let currentDrawScope = "all";

let availableDrawDates = [];


// ------------------------------------------------------------
// DRAW HISTORY STATE
// ------------------------------------------------------------

let drawHistoryData = [];

let historySelectedDate = null;

let historySelectedDrawNumber = null;


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

        const [year, month, day] =
            dateString.split("-").map(Number);

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


        await loadCurrentDrawStatus();


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
            await supabaseClient.auth
                .signInWithPassword({

                    email,
                    password

                });


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
                    `
                    id,
                    created_at,
                    registration_id,
                    name,
                    phone,
                    area,
                    city,
                    source,
                    photo_url
                    `
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


    buildDrawScopeTabs(
        participants
    );


    renderCurrentScope();

}


// ============================================================
// BUILD DATE-WISE DRAW TABS
// ============================================================

function buildDrawScopeTabs(
    participants
) {

    const tabsContainer =
        getElement(
            "drawScopeTabs"
        );


    if (!tabsContainer) {

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
    // INDIVIDUAL DATES
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
// UPDATE ACTIVE DRAW TAB
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
        getElement("searchInput");


    if (searchInput) {

        searchInput.value =
            "";

    }


    updateDrawScopeTabActiveState();


    renderCurrentScope();


    await loadCurrentDrawStatus();

}


// ============================================================
// GET PARTICIPANTS FOR CURRENT SCOPE
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
                : formatDrawDate(
                    currentDrawScope
                );


        selectedDrawScope.innerHTML =
            `
                Selected:
                <strong>
                    ${escapeHTML(
                        scopeText
                    )}
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


                    if (
                        document
                            .getElementById(
                                "drawHistorySection"
                            )
                            ?.classList
                            .contains(
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
                "Draw service HTTP error:",
                result
            );


            return {

                success: false,

                error:
                    result.error ||
                    result.message ||
                    `Draw service error (${response.status}).`

            };

        }


        return result;

    } catch (error) {

        console.error(
            "Draw function request error:",
            error
        );


        return {

            success: false,

            error:
                error.message ||
                "Unable to communicate with the draw service."

        };

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


    const scopeText =
        currentDrawScope === "all"
            ? "Draw All Dates"
            : formatDrawDate(
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
// DRAW WINNER
// ============================================================

async function drawWinner() {

    const participants =
        getParticipantsForCurrentScope();


    currentParticipants =
        participants;


    if (
        !participants ||
        participants.length < 3
    ) {

        const scopeText =
            currentDrawScope === "all"
                ? "all dates"
                : formatDrawDate(
                    currentDrawScope
                );


        alert(
            `At least 3 participants are required for ${scopeText}.`
        );


        return;

    }


    const result =
        await callDrawFunction(
            "status"
        );


    if (
        result?.success &&
        result?.completed
    ) {

        alert(
            "This draw has already been completed. Reset it before drawing again."
        );


        await displayCurrentScopeWinner(
            result
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


        await displayCurrentScopeWinner(
            result
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
                        min-width: 0;
                        padding: 18px;
                        border: 1px solid #e5e7eb;
                        border-radius: 18px;
                        background: #ffffff;
                        box-sizing: border-box;
                        overflow: hidden;
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
                                style="color:#172554;"
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
                                style="color:#172554;"
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
                                style="color:#172554;"
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
                                style="color:#172554;"
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
                                style="color:#172554;"
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
// DISPLAY CURRENT SCOPE WINNER
// ============================================================

async function displayCurrentScopeWinner(
    result
) {

    if (
        result?.success &&
        result?.completed &&
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


    await loadCurrentDrawStatus();

}


// ============================================================
// LOAD CURRENT DRAW STATUS
// ============================================================

async function loadCurrentDrawStatus() {

    if (!isAdminAuthenticated) {

        return;

    }


    try {

        const result =
            await callDrawFunction(
                "status"
            );


        if (
            result?.success &&
            result?.completed &&
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


        const winnerResult =
            getElement(
                "winnerResult"
            );


        if (winnerResult) {

            winnerResult.innerHTML =
                `
                    <p>
                        No winner selected yet.
                    </p>
                `;

        }

    } catch (error) {

        console.error(
            "Current draw status error:",
            error
        );

    }

}


// ============================================================
// RESET DRAW
// ============================================================

function resetDraw() {

    if (!isAdminAuthenticated) {

        alert(
            "Administrator authentication is required."
        );

        return;

    }


    const modal =
        getElement(
            "resetModal"
        );


    if (!modal) {

        console.error(
            "Reset modal element was not found."
        );

        return;

    }


    modal.classList.add(
        "show"
    );

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

        if (!isAdminAuthenticated) {

            alert(
                "Administrator authentication is required."
            );

            return;

        }


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
                "Unable to reset the draw."
            );

            return;

        }


        closeResetModal();


        const winnerResult =
            getElement(
                "winnerResult"
            );


        if (winnerResult) {

            winnerResult.innerHTML =
                `
                    <p>
                        No winner selected yet.
                    </p>
                `;

        }


        await loadDrawHistory();


        const scopeText =
            currentDrawScope === "all"
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
                "historyList"
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
    // Hide the old long table.
    // --------------------------------------------------------

    const oldTable =
        historySection.querySelector(
            "table"
        );


    if (oldTable) {

        oldTable.style.display =
            "none";

    }


    return {

        navigation:
            historyNavigation,

        dateTabs:
            dateTabs,

        drawTabs:
            drawTabs,

        summary:
            summary,

        winners:
            winnersContainer

    };

}


// ============================================================
// LOAD DRAW HISTORY
// ============================================================

async function loadDrawHistory() {

    if (!isAdminAuthenticated) {

        return;

    }


    const containers =
        ensureHistoryContainers();


    if (!containers) {

        return;

    }


    const {
        dateTabs,
        drawTabs,
        summary,
        winners
    } =
        containers;


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
                        ascending:false
                    }
                )
                .order(
                    "id",
                    {
                        ascending:true
                    }
                );


        if (error) {

            console.error(
                "DRAW HISTORY FETCH ERROR:",
                error
            );


            summary.innerHTML =
                "Unable to load draw history.";


            drawTabs.innerHTML =
                "";

            dateTabs.innerHTML =
                "";

            winners.innerHTML =
                "";


            return;

        }


        drawHistoryData =
            data || [];


        if (
            !drawHistoryData.length
        ) {

            dateTabs.innerHTML =
                "";


            drawTabs.innerHTML =
                "";


            summary.innerHTML =
                "No draw history available.";


            winners.innerHTML =
                "";


            historySelectedDate =
                null;

            historySelectedDrawNumber =
                null;


            return;

        }


        // ----------------------------------------------------
        // UNIQUE DRAW DATES
        // ----------------------------------------------------

        const uniqueDates =
            Array.from(
                new Set(
                    drawHistoryData
                        .map(
                            function(item) {

                                return (
                                    item.draw_date ||
                                    ""
                                );

                            }
                        )
                        .filter(Boolean)
                )
            )
            .sort()
            .reverse();


        // ----------------------------------------------------
        // KEEP CURRENT DATE IF POSSIBLE
        // OTHERWISE SELECT LATEST DATE
        // ----------------------------------------------------

        if (
            !historySelectedDate ||
            !uniqueDates.includes(
                historySelectedDate
            )
        ) {

            historySelectedDate =
                uniqueDates[0];

        }


        renderHistoryDateTabs(
            dateTabs,
            uniqueDates
        );


        renderHistoryDrawTabs(
            drawTabs
        );


        renderSelectedHistoryDraw();

    } catch (error) {

        console.error(
            "DRAW HISTORY EXCEPTION:",
            error
        );


        summary.innerHTML =
            "Unable to load draw history.";


        dateTabs.innerHTML =
            "";

        drawTabs.innerHTML =
            "";

        winners.innerHTML =
            "";

    }

}


// ============================================================
// RENDER HISTORY DATE TABS
// ============================================================

function renderHistoryDateTabs(
    container,
    dates
) {

    container.innerHTML =
        "";


    dates.forEach(
        function(dateString) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.textContent =
                formatDrawDate(
                    dateString
                );


            button.dataset.historyDate =
                dateString;


            button.style.cssText =
                `
                    border:1px solid #d7ddea;
                    border-radius:14px;
                    padding:12px 18px;
                    background:#ffffff;
                    color:#172554;
                    font-size:15px;
                    font-weight:700;
                    cursor:pointer;
                    transition:all .2s ease;
                `;


            if (
                dateString ===
                historySelectedDate
            ) {

                button.style.background =
                    "linear-gradient(135deg,#244cff,#e8328a)";

                button.style.color =
                    "#ffffff";

                button.style.borderColor =
                    "#244cff";

                button.style.boxShadow =
                    "0 7px 18px rgba(36,76,255,.18)";

            }


            button.addEventListener(
                "click",
                function() {

                    historySelectedDate =
                        dateString;


                    historySelectedDrawNumber =
                        null;


                    renderHistoryDateTabs(
                        container,
                        dates
                    );


                    renderHistoryDrawTabs(
                        getElement(
                            "drawHistoryDrawTabs"
                        )
                    );


                    renderSelectedHistoryDraw();

                }
            );


            container.appendChild(
                button
            );

        }
    );

}


// ============================================================
// RENDER HISTORY DRAW NUMBER TABS
// ============================================================

function renderHistoryDrawTabs(
    container
) {

    if (!container) {

        return;

    }


    container.innerHTML =
        "";


    const dateDraws =
        drawHistoryData.filter(
            function(item) {

                return (
                    item.draw_date ===
                    historySelectedDate
                );

            }
        );


    const uniqueDrawNumbers =
        Array.from(
            new Set(
                dateDraws
                    .map(
                        function(item) {

                            return Number(
                                item.draw_number
                            );

                        }
                    )
                    .filter(
                        function(number) {

                            return Number.isFinite(
                                number
                            );

                        }
                    )
            )
        )
        .sort(
            function(a, b) {

                return b - a;

            }
        );


    if (
        !uniqueDrawNumbers.length
    ) {

        return;

    }


    if (
        !uniqueDrawNumbers.includes(
            historySelectedDrawNumber
        )
    ) {

        historySelectedDrawNumber =
            uniqueDrawNumbers[0];

    }


    uniqueDrawNumbers.forEach(
        function(drawNumber) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.textContent =
                `Draw ${drawNumber}`;


            button.dataset.drawNumber =
                String(drawNumber);


            button.style.cssText =
                `
                    border:1px solid #d7ddea;
                    border-radius:12px;
                    padding:10px 17px;
                    background:#ffffff;
                    color:#172554;
                    font-size:15px;
                    font-weight:700;
                    cursor:pointer;
                    transition:all .2s ease;
                `;


            if (
                Number(
                    historySelectedDrawNumber
                ) ===
                Number(
                    drawNumber
                )
            ) {

                button.style.background =
                    "linear-gradient(135deg,#ff3158,#ff8a00)";

                button.style.color =
                    "#ffffff";

                button.style.borderColor =
                    "#ff3158";

                button.style.boxShadow =
                    "0 7px 18px rgba(255,74,85,.18)";

            }


            button.addEventListener(
                "click",
                function() {

                    historySelectedDrawNumber =
                        drawNumber;


                    renderHistoryDrawTabs(
                        container
                    );


                    renderSelectedHistoryDraw();

                }
            );


            container.appendChild(
                button
            );

        }
    );

}


// ============================================================
// RENDER SELECTED HISTORY DRAW
// ============================================================

function renderSelectedHistoryDraw() {

    const summary =
        getElement(
            "drawHistorySummary"
        );


    const winnersContainer =
        getElement(
            "drawHistoryWinners"
        );


    if (
        !summary ||
        !winnersContainer
    ) {

        return;

    }


    const selectedDraw =
        drawHistoryData.filter(
            function(item) {

                return (
                    item.draw_date ===
                    historySelectedDate &&

                    Number(
                        item.draw_number
                    ) ===
                    Number(
                        historySelectedDrawNumber
                    )
                );

            }
        )
        .sort(
            function(a, b) {

                return (
                    Number(a.id) -
                    Number(b.id)
                );

            }
        );


    const drawNumbersForDate =
        Array.from(
            new Set(
                drawHistoryData
                    .filter(
                        function(item) {

                            return (
                                item.draw_date ===
                                historySelectedDate
                            );

                        }
                    )
                    .map(
                        function(item) {

                            return Number(
                                item.draw_number
                            );

                        }
                    )
            )
        );


    summary.innerHTML =
        `
            <strong>
                ${escapeHTML(
                    formatDrawDate(
                        historySelectedDate
                    )
                )}
            </strong>

            &nbsp;•&nbsp;

            ${drawNumbersForDate.length}
            draw${drawNumbersForDate.length === 1 ? "" : "s"}

            &nbsp;•&nbsp;

            Showing
            Draw
            ${escapeHTML(
                historySelectedDrawNumber
            )}
        `;


    winnersContainer.innerHTML =
        "";


    if (
        !selectedDraw.length
    ) {

        winnersContainer.innerHTML =
            `
                <div
                    style="
                        grid-column:1/-1;
                        padding:25px;
                        text-align:center;
                        background:#f8fafc;
                        border:1px solid #e5e7eb;
                        border-radius:16px;
                        color:#64748b;
                        font-weight:600;
                    "
                >
                    No winner records found for this draw.
                </div>
            `;


        return;

    }


    selectedDraw
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


                card.style.cssText =
                    `
                        min-width:0;
                        padding:24px;
                        background:#ffffff;
                        border:1px solid #e5e7eb;
                        border-radius:20px;
                        box-sizing:border-box;
                        box-shadow:0 8px 22px rgba(0,0,0,.06);
                        overflow:hidden;
                    `;


                card.innerHTML =
                    `
                        <h3
                            style="
                                margin:0 0 18px;
                                color:#f43f5e;
                                font-size:24px;
                                line-height:1.2;
                            "
                        >
                            ${
                                index === 0
                                    ? "🥇"
                                    : index === 1
                                        ? "🥈"
                                        : "🥉"
                            }
                            WINNER ${index + 1}
                        </h3>


                        <p
                            style="
                                margin:9px 0;
                                font-size:15px;
                                line-height:1.45;
                                overflow-wrap:anywhere;
                            "
                        >
                            <strong
                                style="color:#172554;"
                            >
                                Registration ID:
                            </strong>

                            ${escapeHTML(
                                winner.winner_registration_id ||
                                "-"
                            )}
                        </p>


                        <p
                            style="
                                margin:9px 0;
                                font-size:15px;
                                line-height:1.45;
                                overflow-wrap:anywhere;
                            "
                        >
                            <strong
                                style="color:#172554;"
                            >
                                Name:
                            </strong>

                            ${escapeHTML(
                                winner.winner_name ||
                                "-"
                            )}
                        </p>


                        <p
                            style="
                                margin:9px 0;
                                font-size:15px;
                                line-height:1.45;
                                overflow-wrap:anywhere;
                            "
                        >
                            <strong
                                style="color:#172554;"
                            >
                                Phone:
                            </strong>

                            ${escapeHTML(
                                winner.winner_phone ||
                                "-"
                            )}
                        </p>


                        <p
                            style="
                                margin:9px 0;
                                font-size:14px;
                                color:#64748b;
                            "
                        >
                            Draw time:
                            ${escapeHTML(
                                winner.draw_time ||
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
                        ascending:false
                    }
                );


        if (error) {

            console.error(
                "DRAW HISTORY EXCEL FETCH ERROR:",
                error
            );


            alert(
                "Unable to load draw history for Excel export."
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
                function(draw) {

                    return {

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
                    wch:12
                },

                {
                    wch:15
                },

                {
                    wch:15
                },

                {
                    wch:18
                },

                {
                    wch:28
                },

                {
                    wch:22
                },

                {
                    wch:18
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
            "DRAW HISTORY EXCEL EXCEPTION:",
            error
        );


        alert(
            "Unable to download draw history."
        );

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

window.downloadDrawHistory =
    downloadDrawHistory;


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

        const cleanHistoryButton =
            downloadHistoryButton.cloneNode(
                true
            );


        downloadHistoryButton.replaceWith(
            cleanHistoryButton
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
            "ADMIN INITIALIZATION ERROR:",
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
