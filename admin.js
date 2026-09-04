// ============================================================
// LUCKY DRAW ADMIN DASHBOARD
// SECURE SUPABASE AUTH + ADMIN AUTHORIZATION + REALTIME
// DATE-WISE DRAW SCOPES + DRAW HISTORY
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

let participantRealtimeChannel =
    null;

let currentParticipants =
    [];

let allParticipants =
    [];

let isAdminAuthenticated =
    false;

let isInitializing =
    true;

let dashboardLoadInProgress =
    false;

let authTransitionInProgress =
    false;


// ------------------------------------------------------------
// CURRENT DRAW SCOPE
// "all" = all participants
// "YYYY-MM-DD" = participants registered on that date
// ------------------------------------------------------------

let currentDrawScope =
    "all";


// ------------------------------------------------------------
// DRAW MODAL STATE
// ------------------------------------------------------------

let drawAction =
    "new";


// ============================================================
// DRAW HISTORY STATE
// ============================================================

let allDrawHistory =
    [];

let selectedHistoryDate =
    "all";

let selectedHistoryDrawNumber =
    null;


// ============================================================
// SECURITY / DISPLAY HELPERS
// ============================================================

function escapeHTML(value) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


function getElement(id) {

    return document.getElementById(
        id
    );

}


// ============================================================
// DATE HELPERS
// ============================================================

function formatDateForDisplay(
    dateString
) {

    if (
        !dateString ||
        dateString === "all"
    ) {

        return "All Dates";

    }

    const parts =
        String(
            dateString
        ).split("-");

    if (
        parts.length !== 3
    ) {

        return String(
            dateString
        );

    }

    const year =
        Number(
            parts[0]
        );

    const month =
        Number(
            parts[1]
        );

    const day =
        Number(
            parts[2]
        );

    const date =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return String(
            dateString
        );

    }

    return new Intl.DateTimeFormat(
        "en-GB",
        {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC"
        }
    ).format(
        date
    );

}


// ------------------------------------------------------------
// GET INDIA DATE FROM TIMESTAMPTZ
// ------------------------------------------------------------

function getIndiaDateFromTimestamp(
    timestamp
) {

    if (!timestamp) {

        return null;

    }

    try {

        return new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                    "Asia/Kolkata",
                year:
                    "numeric",
                month:
                    "2-digit",
                day:
                    "2-digit"
            }
        ).format(
            new Date(
                timestamp
            )
        );

    } catch (error) {

        console.error(
            "India date conversion error:",
            error
        );

        return null;

    }

}


// ============================================================
// ADMIN AUTHORIZATION
// ============================================================

async function verifyAdminAccess() {

    try {

        const {
            data: {
                user
            },
            error: userError
        } =
            await supabaseClient
                .auth
                .getUser();

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
                .from(
                    "admin_users"
                )
                .select(
                    "user_id"
                )
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
        getElement(
            "loginPage"
        );

    const adminPage =
        getElement(
            "adminPage"
        );


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
        getElement(
            "loginError"
        );


    if (loginError) {

        loginError.textContent =
            errorMessage;

    }


    const email =
        getElement(
            "adminEmail"
        );

    const password =
        getElement(
            "adminPassword"
        );


    if (password) {

        password.value =
            "";

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

    if (
        dashboardLoadInProgress
    ) {

        return;

    }


    dashboardLoadInProgress =
        true;


    try {

        const loginPage =
            getElement(
                "loginPage"
            );

        const adminPage =
            getElement(
                "adminPage"
            );


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
            data: {
                user
            }
        } =
            await supabaseClient
                .auth
                .getUser();


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

async function loginAdmin(
    event
) {

    event.preventDefault();


    const emailInput =
        getElement(
            "adminEmail"
        );

    const passwordInput =
        getElement(
            "adminPassword"
        );

    const loginButton =
        getElement(
            "loginButton"
        );

    const loginError =
        getElement(
            "loginError"
        );


    const email =
        emailInput?.value
            .trim() ||
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
            await supabaseClient
                .auth
                .signInWithPassword(
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

            await supabaseClient
                .auth
                .signOut();


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

    currentParticipants =
        [];

    allParticipants =
        [];


    try {

        const {
            error
        } =
            await supabaseClient
                .auth
                .signOut();


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

    if (
        !isAdminAuthenticated
    ) {

        return [];

    }


    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from(
                    "Participants"
                )
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
                        ascending:
                            true
                    }
                );


        if (error) {

            console.error(
                "Participant fetch error:",
                error
            );

            return [];

        }


        return data ||
            [];

    } catch (error) {

        console.error(
            "Participant fetch exception:",
            error
        );

        return [];

    }

}


// ============================================================
// GET PARTICIPANTS FOR CURRENT DRAW SCOPE
// ============================================================

function getParticipantsForCurrentScope() {

    if (
        currentDrawScope ===
        "all"
    ) {

        return [
            ...allParticipants
        ];

    }


    return allParticipants.filter(
        function(participant) {

            const indiaDate =
                getIndiaDateFromTimestamp(
                    participant.created_at
                );

            return (
                indiaDate ===
                currentDrawScope
            );

        }
    );

}


// ============================================================
// LOAD PARTICIPANTS
// ============================================================

async function loadParticipants() {

    if (
        !isAdminAuthenticated
    ) {

        return;

    }


    const participants =
        await getParticipants();


    allParticipants =
        participants;


    currentParticipants =
        getParticipantsForCurrentScope();


    renderDrawScopeTabs();


    renderCurrentScope();


    await restoreCurrentScopeWinner();

}


// ============================================================
// RENDER CURRENT PARTICIPANT SCOPE
// ============================================================

function renderCurrentScope() {

    currentParticipants =
        getParticipantsForCurrentScope();


    const searchInput =
        getElement(
            "searchInput"
        );


    if (searchInput) {

        searchInput.value =
            "";

    }


    displayParticipants(
        currentParticipants
    );


    updateParticipantCount(
        currentParticipants
    );


    updateSelectedScopeText(
        currentParticipants
    );

}


// ============================================================
// UPDATE PARTICIPANT COUNT
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

}


// ============================================================
// UPDATE SELECTED SCOPE TEXT
// ============================================================

function updateSelectedScopeText(
    participants
) {

    const selectedDrawScope =
        getElement(
            "selectedDrawScope"
        );


    const scopeText =
        currentDrawScope ===
            "all"

            ? "Draw All Dates"

            : formatDateForDisplay(
                currentDrawScope
            );


    if (selectedDrawScope) {

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
// REALTIME
// ============================================================

function startParticipantRealtime() {

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
                async function(
                    payload
                ) {

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


async function stopParticipantRealtime() {

    if (
        !participantRealtimeChannel
    ) {

        return;

    }


    try {

        await supabaseClient
            .removeChannel(
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
            participant?.source ||
            ""
        )
            .trim()
            .toLowerCase();


    const photoSources =
        new Set(
            [
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
            ]
        );


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
            function(
                participant
            ) {

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
// DRAW SCOPE TABS
// ============================================================

function getAvailableDateScopes(
    participants
) {

    const dateSet =
        new Set();


    participants.forEach(
        function(
            participant
        ) {

            const date =
                getIndiaDateFromTimestamp(
                    participant.created_at
                );


            if (date) {

                dateSet.add(
                    date
                );

            }

        }
    );


    return Array.from(
        dateSet
    ).sort(
        function(
            a,
            b
        ) {

            return b.localeCompare(
                a
            );

        }
    );

}


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
            currentDrawScope ===
            "all"
                ? " active"
                : ""
        );

    allButton.textContent =
        "Draw All Dates";


    allButton.dataset.scope =
        "all";


    allButton.setAttribute(
        "role",
        "tab"
    );


    allButton.setAttribute(
        "aria-selected",
        currentDrawScope ===
            "all"
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
        function(
            dateKey
        ) {

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


            button.dataset.scope =
                dateKey;


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
// SELECT DRAW SCOPE
// ============================================================

async function selectDrawScope(
    scope
) {

    currentDrawScope =
        scope ||
        "all";


    const searchInput =
        getElement(
            "searchInput"
        );


    if (searchInput) {

        searchInput.value =
            "";

    }


    currentParticipants =
        getParticipantsForCurrentScope();


    updateDrawScopeTabActiveState();


    renderCurrentScope();


    await restoreCurrentScopeWinner();

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
        function(
            button
        ) {

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
// DRAW EDGE FUNCTION
// ============================================================

async function callDrawFunction(
    action
) {

    if (
        !isAdminAuthenticated
    ) {

        return {
            success:
                false,
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
            await supabaseClient
                .auth
                .getSession();


        if (
            !session ||
            !session.access_token
        ) {

            return {
                success:
                    false,
                error:
                    "Your admin session has expired. Please log in again."
            };

        }


        console.log(
            "Calling draw-winner function:",
            {
                action:
                    action,
                draw_scope:
                    currentDrawScope
            }
        );


        const response =
            await fetch(
                DRAW_FUNCTION_URL,
                {
                    method:
                        "POST",

                    headers:
                        {
                            "Content-Type":
                                "application/json",

                            "Authorization":
                                `Bearer ${session.access_token}`,

                            "apikey":
                                SUPABASE_KEY
                        },

                    body:
                        JSON.stringify(
                            {
                                action:
                                    action,

                                draw_scope:
                                    currentDrawScope
                            }
                        )
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
                success:
                    false,
                error:
                    responseText ||
                    "The draw service returned an invalid response."
            };

        }


        if (
            !response.ok
        ) {

            console.error(
                "Draw Edge Function returned non-2xx:",
                response.status,
                result
            );


            return {
                success:
                    false,
                error:
                    result?.error ||
                    `Draw service returned HTTP ${response.status}.`
            };

        }


        return (
            result || {
                success:
                    false,
                error:
                    "Empty response from draw service."
            }
        );

    } catch (error) {

        console.error(
            "Draw function exception:",
            error
        );


        return {
            success:
                false,
            error:
                "Unable to communicate with the draw service."
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

    if (
        !isAdminAuthenticated
    ) {

        return;

    }


    try {

        const result =
            await getCurrentDrawStatus();


        if (
            result &&
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

        } else {

            showNoWinner();

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

            ? "Draw All Dates"

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

    if (
        !isAdminAuthenticated
    ) {

        alert(
            "Administrator authentication is required."
        );

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

        const scopeText =
            currentDrawScope ===
                "all"

                ? "all dates"

                : formatDateForDisplay(
                    currentDrawScope
                );


        alert(
            `At least 3 participants are required for the selected draw scope (${scopeText}).`
        );


        return;

    }


    const status =
        await getCurrentDrawStatus();


    if (
        status &&
        status.success &&
        status.completed
    ) {

        alert(
            currentDrawScope ===
                "all"

                ? "The All Dates draw has already been completed. Reset it before selecting new winners."

                : `The draw for ${formatDateForDisplay(currentDrawScope)} has already been completed. Reset it before selecting new winners.`
        );


        await restoreCurrentScopeWinner();


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
            "🎉 Drawing...";

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


        console.log(
            "Draw completed:",
            result
        );


    } catch (error) {

        console.error(
            "Draw exception:",
            error
        );


        alert(
            "An error occurred while conducting the draw."
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
// DISPLAY WINNERS
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


    winnerResult.innerHTML =
        "";


    if (
        !winners ||
        !winners.length
    ) {

        showNoWinner();

        return;

    }


    const winnerList =
        winners.slice(
            0,
            3
        );


    winnerList.forEach(
        function(
            winner,
            index
        ) {

            const card =
                document.createElement(
                    "div"
                );


            const winnerNumber =
                index + 1;


            const registrationId =
                winner.registration_id ||
                winner.winner_registration_id ||
                winner.id ||
                "-";


            card.innerHTML =
                `
                    <h3>
                        ${winnerNumber === 1
                            ? "🥇"
                            : winnerNumber === 2
                                ? "🥈"
                                : "🥉"
                        }
                        WINNER ${winnerNumber}
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
                            winner.winner_name ||
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
                            winner.winner_phone ||
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
// RESET DRAW
// ============================================================

async function resetDraw() {

    if (
        !isAdminAuthenticated
    ) {

        alert(
            "Administrator authentication is required."
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
        !status.completed
    ) {

        alert(
            currentDrawScope ===
                "all"

                ? "There is no completed All Dates draw to reset."

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


        showNoWinner();


        await restoreCurrentScopeWinner();


        await loadDrawHistory();


        // Reset completed successfully.
        // No success popup is shown.
        console.log(
            "Draw reset successfully. History preserved.",
            {
                draw_scope:
                    currentDrawScope
            }
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
//
// IMPORTANT:
// The History page uses draw_scope, NOT draw_date,
// to determine which registration-date tab a draw belongs to.
//
// draw_date = actual calendar date/time when the draw was conducted
// draw_scope = selected registration-date scope used for the draw
//
// Therefore:
// A draw performed today for "22 September 2026"
// still belongs under the "22 September 2026" History tab.
//
// The database draw_number remains untouched.
// The History UI creates LOCAL draw numbers per scope.
// ============================================================


// ------------------------------------------------------------
// GET HISTORY SCOPE
// ------------------------------------------------------------

function getHistoryScope(
    record
) {

    if (
        record &&
        record.draw_scope
    ) {

        return String(
            record.draw_scope
        );

    }


    // Legacy records without draw_scope.
    // These are treated as All Dates.
    return "all";

}


// ------------------------------------------------------------
// GET HISTORY DATE LABEL
// ------------------------------------------------------------

function getHistoryDateLabel(
    scope
) {

    if (
        scope ===
        "all"
    ) {

        return "All Dates";

    }


    return formatDateForDisplay(
        scope
    );

}


// ------------------------------------------------------------
// GET HISTORY DATE SCOPES
// ------------------------------------------------------------

function getHistoryDateScopes() {

    const scopes =
        new Set();


    allDrawHistory.forEach(
        function(
            record
        ) {

            scopes.add(
                getHistoryScope(
                    record
                )
            );

        }
    );


    return Array.from(
        scopes
    ).sort(
        function(
            a,
            b
        ) {

            if (
                a ===
                "all"
            ) {

                return -1;

            }


            if (
                b ===
                "all"
            ) {

                return 1;

            }


            return b.localeCompare(
                a
            );

        }
    );

}


// ------------------------------------------------------------
// GET HISTORY RECORDS FOR DATE
// ------------------------------------------------------------

function getHistoryRecordsForDate(
    scope
) {

    return allDrawHistory.filter(
        function(
            record
        ) {

            return (
                getHistoryScope(
                    record
                ) ===
                scope
            );

        }
    );

}


// ------------------------------------------------------------
// GET UNIQUE GLOBAL DRAWS FOR A SCOPE
// ------------------------------------------------------------
//
// Every draw creates 3 history rows with the same global
// draw_number.
//
// We first group those 3 rows into one logical draw.
// Then the UI gives that logical draw a local number:
// Draw 1, Draw 2, Draw 3...
//
// This means 22 September can have Draw 1-5 even if the
// database global draw numbers are 39, 43, 44, 47, 51.
// ------------------------------------------------------------

function getHistoryDrawGroups(
    scope
) {

    const records =
        getHistoryRecordsForDate(
            scope
        );


    const grouped =
        new Map();


    records.forEach(
        function(
            record
        ) {

            const globalNumber =
                String(
                    record.draw_number ??
                    ""
                );


            if (
                !grouped.has(
                    globalNumber
                )
            ) {

                grouped.set(
                    globalNumber,
                    []
                );

            }


            grouped
                .get(
                    globalNumber
                )
                .push(
                    record
                );

        }
    );


    const groups =
        Array.from(
            grouped.entries()
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


    groups.sort(
        function(
            a,
            b
        ) {

            const aRecord =
                a.records[0];

            const bRecord =
                b.records[0];


            const aId =
                Number(
                    aRecord?.id ||
                    0
                );

            const bId =
                Number(
                    bRecord?.id ||
                    0
                );


            if (
                aId !==
                bId
            ) {

                return bId -
                    aId;

            }


            return Number(
                b.globalDrawNumber
            ) -
            Number(
                a.globalDrawNumber
            );

        }
    );


    // Newest draw first.
    // Add local numbering.
    groups.forEach(
        function(
            group,
            index
        ) {

            group.localDrawNumber =
                groups.length -
                index;

        }
    );


    return groups;

}


// ------------------------------------------------------------
// FIND HISTORY GROUP BY LOCAL DRAW NUMBER
// ------------------------------------------------------------

function getHistoryGroupByLocalNumber(
    scope,
    localNumber
) {

    const groups =
        getHistoryDrawGroups(
            scope
        );


    return groups.find(
        function(
            group
        ) {

            return (
                group.localDrawNumber ===
                Number(
                    localNumber
                )
            );

        }
    ) || null;

}


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
            ) ||
            getElement(
                "historyList"
            );


        if (
            historyList &&
            historyList.closest(
                "table"
            )
        ) {

            const table =
                historyList.closest(
                    "table"
                );


            if (
                table.parentElement
            ) {

                table.parentElement.insertBefore(
                    historyNavigation,
                    table
                );

            }

        } else {

            historySection.appendChild(
                historyNavigation
            );

        }

    }


    let dateTabs =
        getElement(
            "historyDateTabs"
        );


    if (!dateTabs) {

        dateTabs =
            document.createElement(
                "div"
            );


        dateTabs.id =
            "historyDateTabs";


        dateTabs.style.cssText =
            `
                display:flex;
                flex-wrap:wrap;
                gap:12px;
                margin-bottom:18px;
            `;


        historyNavigation.appendChild(
            dateTabs
        );

    }


    let drawTabs =
        getElement(
            "historyDrawTabs"
        );


    if (!drawTabs) {

        drawTabs =
            document.createElement(
                "div"
            );


        drawTabs.id =
            "historyDrawTabs";


        drawTabs.style.cssText =
            `
                display:flex;
                flex-wrap:wrap;
                gap:12px;
                margin-bottom:20px;
            `;


        historyNavigation.appendChild(
            drawTabs
        );

    }


    let summary =
        getElement(
            "historySummary"
        );


    if (!summary) {

        summary =
            document.createElement(
                "div"
            );


        summary.id =
            "historySummary";


        summary.style.cssText =
            `
                width:100%;
                box-sizing:border-box;
                padding:16px 20px;
                margin-bottom:22px;
                border:1px solid #e5e7eb;
                border-radius:18px;
                background:#f8fafc;
                color:#172554;
                font-size:18px;
                font-weight:700;
            `;


        historyNavigation.appendChild(
            summary
        );

    }


    let winnersContainer =
        getElement(
            "historyWinners"
        );


    if (!winnersContainer) {

        winnersContainer =
            document.createElement(
                "div"
            );


        winnersContainer.id =
            "historyWinners";


        winnersContainer.style.cssText =
            `
                width:100%;
                display:grid;
                grid-template-columns:repeat(3,minmax(0,1fr));
                gap:20px;
                margin-bottom:25px;
            `;


        const table =
            (
                getElement(
                    "drawHistoryList"
                ) ||
                getElement(
                    "historyList"
                )
            )?.closest(
                "table"
            );


        if (
            table &&
            table.parentElement
        ) {

            table.parentElement.insertBefore(
                winnersContainer,
                table
            );

        } else {

            historySection.appendChild(
                winnersContainer
            );

        }

    }


    return {

        historyNavigation,
        dateTabs,
        drawTabs,
        summary,
        winnersContainer

    };

}


// ------------------------------------------------------------
// RENDER HISTORY DATE TABS
// ------------------------------------------------------------

function renderHistoryDateTabs() {

    const containers =
        ensureHistoryContainers();


    if (!containers) {

        return;

    }


    const dateTabs =
        containers.dateTabs;


    dateTabs.innerHTML =
        "";


    const scopes =
        getHistoryDateScopes();


    if (
        !scopes.length
    ) {

        dateTabs.innerHTML =
            `
                <div
                    style="
                        padding:14px 18px;
                        border:1px solid #e5e7eb;
                        border-radius:14px;
                        background:#f8fafc;
                        color:#172554;
                        font-weight:600;
                    "
                >
                    No draw dates available yet.
                </div>
            `;

        return;

    }


    scopes.forEach(
        function(
            scope
        ) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.textContent =
                getHistoryDateLabel(
                    scope
                );


            button.dataset.scope =
                scope;


            button.style.cssText =
                `
                    padding:13px 22px;
                    border:1px solid #d7deea;
                    border-radius:15px;
                    background:#ffffff;
                    color:#172554;
                    font-size:17px;
                    font-weight:700;
                    cursor:pointer;
                    transition:0.2s ease;
                `;


            if (
                selectedHistoryDate ===
                scope
            ) {

                button.style.background =
                    "linear-gradient(135deg,#2563eb,#ec4899)";

                button.style.color =
                    "#ffffff";

                button.style.borderColor =
                    "#2563eb";

                button.style.boxShadow =
                    "0 8px 18px rgba(37,99,235,0.22)";

            }


            button.addEventListener(
                "click",
                function() {

                    selectHistoryDate(
                        scope
                    );

                }
            );


            dateTabs.appendChild(
                button
            );

        }
    );

}


// ------------------------------------------------------------
// SELECT HISTORY DATE
// ------------------------------------------------------------

function selectHistoryDate(
    scope
) {

    selectedHistoryDate =
        scope;


    const groups =
        getHistoryDrawGroups(
            selectedHistoryDate
        );


    if (
        groups.length
    ) {

        selectedHistoryDrawNumber =
            groups[0].localDrawNumber;

    } else {

        selectedHistoryDrawNumber =
            null;

    }


    renderHistoryView();

}


// ------------------------------------------------------------
// RENDER HISTORY DRAW TABS
// ------------------------------------------------------------

function renderHistoryDrawTabs() {

    const containers =
        ensureHistoryContainers();


    if (!containers) {

        return;

    }


    const drawTabs =
        containers.drawTabs;


    drawTabs.innerHTML =
        "";


    const groups =
        getHistoryDrawGroups(
            selectedHistoryDate
        );


    if (
        !groups.length
    ) {

        return;

    }


    // Newest first
    groups.forEach(
        function(
            group
        ) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.textContent =
                `Draw ${group.localDrawNumber}`;


            button.dataset.drawNumber =
                group.localDrawNumber;


            button.style.cssText =
                `
                    padding:12px 24px;
                    border:1px solid #d7deea;
                    border-radius:14px;
                    background:#ffffff;
                    color:#172554;
                    font-size:17px;
                    font-weight:700;
                    cursor:pointer;
                    transition:0.2s ease;
                `;


            if (
                selectedHistoryDrawNumber ===
                group.localDrawNumber
            ) {

                button.style.background =
                    "linear-gradient(135deg,#2563eb,#ec4899)";

                button.style.color =
                    "#ffffff";

                button.style.borderColor =
                    "#2563eb";

                button.style.boxShadow =
                    "0 8px 18px rgba(37,99,235,0.22)";

            }


            button.addEventListener(
                "click",
                function() {

                    selectedHistoryDrawNumber =
                        group.localDrawNumber;

                    renderHistoryView();

                }
            );


            drawTabs.appendChild(
                button
            );

        }
    );

}


// ------------------------------------------------------------
// UPDATE HISTORY SUMMARY
// ------------------------------------------------------------

function updateHistorySummary() {

    const containers =
        ensureHistoryContainers();


    if (!containers) {

        return;

    }


    const summary =
        containers.summary;


    const groups =
        getHistoryDrawGroups(
            selectedHistoryDate
        );


    const dateText =
        getHistoryDateLabel(
            selectedHistoryDate
        );


    if (
        !groups.length
    ) {

        summary.textContent =
            `${dateText} • No draws have been conducted yet.`;

        return;

    }


    const selectedGroup =
        getHistoryGroupByLocalNumber(
            selectedHistoryDate,
            selectedHistoryDrawNumber
        );


    summary.innerHTML =
        `
            <strong>
                ${escapeHTML(
                    dateText
                )}
            </strong>

            <span
                style="
                    margin:0 8px;
                "
            >
                •
            </span>

            <strong>
                ${groups.length}
            </strong>

            draws

            ${
                selectedGroup
                    ? `
                        <span
                            style="
                                margin:0 8px;
                            "
                        >
                            •
                        </span>

                        Showing
                        <strong>
                            Draw ${selectedGroup.localDrawNumber}
                        </strong>
                    `
                    : ""
            }
        `;

}


// ------------------------------------------------------------
// RENDER HISTORY WINNERS
// ------------------------------------------------------------

function renderHistoryWinners() {

    const containers =
        ensureHistoryContainers();


    if (!containers) {

        return;

    }


    const winnersContainer =
        containers.winnersContainer;


    winnersContainer.innerHTML =
        "";


    const selectedGroup =
        getHistoryGroupByLocalNumber(
            selectedHistoryDate,
            selectedHistoryDrawNumber
        );


    if (
        !selectedGroup
    ) {

        winnersContainer.style.display =
            "none";

        return;

    }


    winnersContainer.style.display =
        "grid";


    const records =
        [...selectedGroup.records]
            .sort(
                function(
                    a,
                    b
                ) {

                    return Number(
                        a.id ||
                        0
                    ) -
                    Number(
                        b.id ||
                        0
                    );

                }
            );


    records
        .slice(
            0,
            3
        )
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
                        background:#ffffff;
                        border:1px solid #e5e7eb;
                        border-radius:24px;
                        padding:26px;
                        box-sizing:border-box;
                        box-shadow:0 10px 25px rgba(0,0,0,0.05);
                        min-width:0;
                    `;


                const winnerNumber =
                    index + 1;


                const medal =
                    winnerNumber === 1
                        ? "🥇"
                        : winnerNumber === 2
                            ? "🥈"
                            : "🥉";


                card.innerHTML =
                    `
                        <h3
                            style="
                                margin:0 0 20px;
                                color:#f43f5e;
                                font-size:28px;
                            "
                        >
                            ${medal}
                            WINNER ${winnerNumber}
                        </h3>


                        <p
                            style="
                                margin:9px 0;
                                font-size:16px;
                                line-height:1.5;
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
                                winner.winner_registration_id ||
                                "-"
                            )}
                        </p>


                        <p
                            style="
                                margin:9px 0;
                                font-size:16px;
                                line-height:1.5;
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
                                winner.winner_name ||
                                "-"
                            )}
                        </p>


                        <p
                            style="
                                margin:9px 0;
                                font-size:16px;
                                line-height:1.5;
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


// ------------------------------------------------------------
// RENDER HISTORY TABLE
// ------------------------------------------------------------

function renderHistoryTable() {

    const historyList =
        getElement(
            "drawHistoryList"
        ) ||
        getElement(
            "historyList"
        );


    if (!historyList) {

        return;

    }


    const selectedGroup =
        getHistoryGroupByLocalNumber(
            selectedHistoryDate,
            selectedHistoryDrawNumber
        );


    if (
        !selectedGroup
    ) {

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

        return;

    }


    const records =
        [...selectedGroup.records]
            .sort(
                function(
                    a,
                    b
                ) {

                    return Number(
                        a.id ||
                        0
                    ) -
                    Number(
                        b.id ||
                        0
                    );

                }
            );


    historyList.innerHTML =
        "";


    records
        .slice(
            0,
            3
        )
        .forEach(
            function(
                draw
            ) {

                historyList.innerHTML +=
                    `
                        <tr>

                            <td>

                                <strong>
                                    ${escapeHTML(
                                        selectedGroup.localDrawNumber
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

                                <strong>
                                    ${escapeHTML(
                                        draw.winner_name ||
                                        "-"
                                    )}
                                </strong>

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


// ------------------------------------------------------------
// RENDER COMPLETE HISTORY VIEW
// ------------------------------------------------------------

function renderHistoryView() {

    ensureHistoryContainers();


    renderHistoryDateTabs();


    renderHistoryDrawTabs();


    updateHistorySummary();


    renderHistoryWinners();


    renderHistoryTable();

}


// ------------------------------------------------------------
// LOAD DRAW HISTORY
// ------------------------------------------------------------

async function loadDrawHistory() {

    if (
        !isAdminAuthenticated
    ) {

        return;

    }


    const historyList =
        getElement(
            "drawHistoryList"
        ) ||
        getElement(
            "historyList"
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
                .from(
                    "draw_history"
                )
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
            data ||
            [];


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


        // ----------------------------------------------------
        // If current selected history date no longer exists,
        // select the newest available scope.
        // ----------------------------------------------------

        const availableScopes =
            getHistoryDateScopes();


        if (
            !availableScopes.includes(
                selectedHistoryDate
            )
        ) {

            selectedHistoryDate =
                availableScopes[0];

        }


        const groups =
            getHistoryDrawGroups(
                selectedHistoryDate
            );


        if (
            !groups.length
        ) {

            selectedHistoryDate =
                availableScopes[0];

        }


        const selectedDateGroups =
            getHistoryDrawGroups(
                selectedHistoryDate
            );


        if (
            !selectedDateGroups.some(
                function(
                    group
                ) {

                    return (
                        group.localDrawNumber ===
                        selectedHistoryDrawNumber
                    );

                }
            )
        ) {

            selectedHistoryDrawNumber =
                selectedDateGroups.length
                    ? selectedDateGroups[0].localDrawNumber
                    : null;

        }


        renderHistoryView();


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
        function(
            section
        ) {

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
        function(
            menuButton
        ) {

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
// INLINE HTML ACCESS
// ============================================================

window.showAdminSection =
    showAdminSection;

window.loadDrawHistory =
    loadDrawHistory;

window.selectDrawScope =
    selectDrawScope;


// ============================================================
// DOWNLOAD DRAW HISTORY TO EXCEL
// ============================================================

async function downloadDrawHistory() {

    if (
        !isAdminAuthenticated
    ) {

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
                .from(
                    "draw_history"
                )
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
                    "id",
                    {
                        ascending:
                            true
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
            data.length ===
            0
        ) {

            alert(
                "There is no draw history available to download."
            );

            return;

        }


        const scopeCounters =
            new Map();


        const groupedForExcel =
            new Map();


        data.forEach(
            function(
                record
            ) {

                const scope =
                    getHistoryScope(
                        record
                    );


                const globalNumber =
                    String(
                        record.draw_number
                    );


                const key =
                    `${scope}__${globalNumber}`;


                if (
                    !groupedForExcel.has(
                        key
                    )
                ) {

                    groupedForExcel.set(
                        key,
                        []
                    );

                }


                groupedForExcel
                    .get(
                        key
                    )
                    .push(
                        record
                    );

            }
        );


        const groupEntries =
            Array.from(
                groupedForExcel.entries()
            );


        const scopeGroups =
            new Map();


        groupEntries.forEach(
            function(
                entry
            ) {

                const scope =
                    entry[1][0]
                        ? getHistoryScope(
                            entry[1][0]
                        )
                        : "all";


                if (
                    !scopeGroups.has(
                        scope
                    )
                ) {

                    scopeGroups.set(
                        scope,
                        []
                    );

                }


                scopeGroups
                    .get(
                        scope
                    )
                    .push(
                        {
                            key:
                                entry[0],
                            records:
                                entry[1]
                        }
                    );

            }
        );


        scopeGroups.forEach(
            function(
                groups
            ) {

                groups.sort(
                    function(
                        a,
                        b
                    ) {

                        const aId =
                            Number(
                                a.records[0]?.id ||
                                0
                            );

                        const bId =
                            Number(
                                b.records[0]?.id ||
                                0
                            );


                        return aId -
                            bId;

                    }
                );


                groups.forEach(
                    function(
                        group,
                        index
                    ) {

                        scopeCounters.set(
                            group.key,
                            index + 1
                        );

                    }
                );

            }
        );


        const excelData =
            data.map(
                function(
                    draw
                ) {

                    const scope =
                        getHistoryScope(
                            draw
                        );


                    const key =
                        `${scope}__${String(
                            draw.draw_number
                        )}`;


                    return {

                        "Draw No.":
                            scopeCounters.get(
                                key
                            ) ||
                            "",

                        "Registration Date":
                            scope ===
                                "all"

                                ? "All Dates"

                                : formatDateForDisplay(
                                    scope
                                ),

                        "Actual Draw Date":
                            draw.draw_date ||
                            "",

                        "Time":
                            draw.draw_time ||
                            "",

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
                    wch: 12
                },
                {
                    wch: 25
                },
                {
                    wch: 18
                },
                {
                    wch: 15
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


        console.log(
            "Draw history Excel downloaded successfully."
        );


    } catch (error) {

        console.error(
            "Draw history Excel exception:",
            error
        );


        alert(
            "Unable to download draw history."
        );

    }

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


    // --------------------------------------------------------
    // DRAW HISTORY EXCEL BUTTON
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


        cleanHistoryButton.removeAttribute(
            "onclick"
        );


        downloadHistoryButton.replaceWith(
            cleanHistoryButton
        );


        cleanHistoryButton.addEventListener(
            "click",
            downloadDrawHistory
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

                    await supabaseClient
                        .auth
                        .signOut();


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
            await supabaseClient
                .auth
                .getSession();


        if (!session) {

            showLoginPage();

            return;

        }


        const isAdmin =
            await verifyAdminAccess();


        if (!isAdmin) {

            await supabaseClient
                .auth
                .signOut();


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
