// ============================================================
// LUCKY DRAW ADMIN DASHBOARD
// SECURE SUPABASE AUTH + ADMIN AUTHORIZATION
// DATE-WISE DRAW + SERVER-SIDE DRAW + SECURE RESET
// REALTIME PARTICIPANTS + DRAW HISTORY
// ============================================================


const SUPABASE_URL =
    "https://mvwaanrbqjozxbncogzf.supabase.co";


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


let participantRealtimeChannel =
    null;


let allParticipants =
    [];


let currentParticipants =
    [];


let isAdminAuthenticated =
    false;


let isInitializing =
    true;


let dashboardLoadInProgress =
    false;


let authTransitionInProgress =
    false;


let selectedDrawScope =
    "all";


let drawAction =
    "new";


// ============================================================
// DRAW HISTORY STATE
// ============================================================


let allDrawHistory =
    [];


let selectedHistoryDate =
    null;


let selectedHistoryDrawNumber =
    null;


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


function getIndiaDateKey(
    timestamp
) {

    if (!timestamp) {

        return null;

    }


    try {

        const date =
            new Date(timestamp);


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return null;

        }


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
        ).format(date);

    } catch (error) {

        console.error(
            "India date conversion error:",
            error
        );

        return null;

    }

}


function formatDateForDisplay(
    dateKey
) {

    if (
        !dateKey ||
        dateKey === "all"
    ) {

        return "Draw All Dates";

    }


    try {

        const parts =
            dateKey
                .split("-")
                .map(Number);


        if (
            parts.length !== 3
        ) {

            return dateKey;

        }


        const date =
            new Date(
                Date.UTC(
                    parts[0],
                    parts[1] - 1,
                    parts[2]
                )
            );


        return new Intl.DateTimeFormat(
            "en-GB",
            {
                day:
                    "numeric",

                month:
                    "long",

                year:
                    "numeric",

                timeZone:
                    "UTC"
            }
        ).format(date);

    } catch (error) {

        return dateKey;

    }

}


function formatDrawDate(
    dateString
) {

    return formatDateForDisplay(
        dateString
    );

}


// ============================================================
// AVAILABLE PARTICIPANT DATE SCOPES
// ============================================================


function getAvailableDateScopes(
    participants
) {

    const dates =
        new Set();


    if (
        !participants ||
        !participants.length
    ) {

        return [];

    }


    participants.forEach(
        function(participant) {

            const dateKey =
                getIndiaDateKey(
                    participant.created_at
                );


            if (dateKey) {

                dates.add(
                    dateKey
                );

            }

        }
    );


    return Array.from(
        dates
    ).sort();

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


    allDrawHistory =
        [];


    selectedHistoryDate =
        null;


    selectedHistoryDrawNumber =
        null;


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
// FILTER PARTICIPANTS BY DRAW SCOPE
// ============================================================


function getParticipantsForScope(
    participants,
    drawScope
) {

    if (
        drawScope ===
        "all"
    ) {

        return [
            ...participants
        ];

    }


    return participants.filter(
        function(participant) {

            return (
                getIndiaDateKey(
                    participant.created_at
                ) ===
                drawScope
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


    const availableDates =
        getAvailableDateScopes(
            allParticipants
        );


    if (
        selectedDrawScope !==
        "all" &&
        !availableDates.includes(
            selectedDrawScope
        )
    ) {

        selectedDrawScope =
            "all";

    }


    renderDrawScopeTabs();


    renderCurrentScope();


    await restoreCurrentScopeWinner();

}


// ============================================================
// RENDER DRAW SCOPE TABS
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
            selectedDrawScope ===
            "all"
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
        selectedDrawScope ===
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
                    selectedDrawScope ===
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
                selectedDrawScope ===
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
    drawScope
) {

    selectedDrawScope =
        drawScope ||
        "all";


    clearSearchInput();


    renderDrawScopeTabs();


    renderCurrentScope();


    await restoreCurrentScopeWinner();

}


// ============================================================
// RENDER CURRENT SCOPE
// ============================================================


function renderCurrentScope() {

    currentParticipants =
        getParticipantsForScope(
            allParticipants,
            selectedDrawScope
        );


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

    const selectedDrawScopeElement =
        getElement(
            "selectedDrawScope"
        );


    if (
        selectedDrawScopeElement
    ) {

        const scopeText =
            selectedDrawScope ===
            "all"
                ? "Draw All Dates"
                : formatDateForDisplay(
                    selectedDrawScope
                );


        selectedDrawScopeElement.innerHTML =
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


    if (
        selectedScopeCount
    ) {

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


    if (
        selectedScopeCount
    ) {

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
        getParticipantsForScope(
            allParticipants,
            selectedDrawScope
        );


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
// VIEW PARTICIPANTS
// ============================================================


async function viewParticipants() {

    renderCurrentScope();

}


// ============================================================
// REALTIME PARTICIPANTS
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
                    event:
                        "*",

                    schema:
                        "public",

                    table:
                        "Participants"
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


                    const historySection =
                        getElement(
                            "drawHistorySection"
                        );


                    if (
                        historySection &&
                        historySection.classList.contains(
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
                "Administrator access required."

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
                            selectedDrawScope

                    }
                }
            );


        if (error) {

            console.error(
                "Draw Edge Function error:",
                error
            );


            return {

                success:
                    false,

                error:
                    error.message ||
                    "Unable to communicate with draw service."

            };

        }


        return (
            data || {
                success:
                    false,

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

            success:
                false,

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
        selectedDrawScope ===
        "all"
            ? "All Dates"
            : formatDateForDisplay(
                selectedDrawScope
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

    if (
        !isAdminAuthenticated
    ) {

        return;

    }


    const participants =
        getParticipantsForScope(
            allParticipants,
            selectedDrawScope
        );


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
            selectedDrawScope ===
                "all"

                ? "At least 3 participants are required for a 3-winner lucky draw."

                : `At least 3 participants registered on ${formatDateForDisplay(selectedDrawScope)} are required for a 3-winner lucky draw.`
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

        alert(
            `The draw for ${
                selectedDrawScope ===
                    "all"
                    ? "All Dates"
                    : formatDateForDisplay(
                        selectedDrawScope
                    )
            } has already been completed. Reset this draw before selecting new winners.`
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
            result.winners ||
            []
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

        clearWinnerDisplay();

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
            .join(
                ""
            );

}


// ============================================================
// CLEAR WINNER DISPLAY
// ============================================================


function clearWinnerDisplay() {

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
            result?.success &&
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

            clearWinnerDisplay();

        }

    } catch (error) {

        console.error(
            "Winner status restore error:",
            error
        );

    }

}


// ============================================================
// RESET DRAW
// ============================================================


async function resetDraw() {

    if (
        !isAdminAuthenticated
    ) {

        return;

    }


    const status =
        await getCurrentDrawStatus();


    if (
        !status.success
    ) {

        alert(
            status.error ||
            "Unable to check the current draw."
        );

        return;

    }


    if (
        !status.completed
    ) {

        alert(
            `There is no completed draw to reset for ${
                selectedDrawScope ===
                    "all"
                    ? "All Dates"
                    : formatDateForDisplay(
                        selectedDrawScope
                    )
            }.`
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
            !result.success
        ) {

            alert(
                result.error ||
                "Unable to reset the draw."
            );


            return;

        }


        closeResetModal();


        clearWinnerDisplay();


        await restoreCurrentScopeWinner();


    } catch (error) {

        console.error(
            "Reset draw error:",
            error
        );


        alert(
            "Unable to reset the draw. Please try again."
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
                wch:
                    8
            },

            {
                wch:
                    20
            },

            {
                wch:
                    25
            },

            {
                wch:
                    18
            },

            {
                wch:
                    30
            },

            {
                wch:
                    25
            },

            {
                wch:
                    22
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
// IMPORTANT:
// History grouping uses draw_scope for date-specific draws.
// This keeps history synchronized with the Dashboard's
// selected registration date.
// ============================================================


// ============================================================
// CREATE HISTORY UI CONTAINERS
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
                margin-top:20px;
            `;


        const historyTable =
            historySection.querySelector(
                "table"
            );


        if (
            historyTable &&
            historyTable.parentElement
        ) {

            historyTable.parentElement.insertBefore(
                historyNavigation,
                historyTable
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
    // DRAW NUMBER TABS
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
                @media (max-width: 700px) {

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
                    box-shadow:0 5px 14px rgba(0,0,0,0.08);

                }

                #drawHistoryDateTabs button.active,
                #drawHistoryDrawTabs button.active {

                    background:linear-gradient(
                        135deg,
                        #2563eb,
                        #ec4899
                    );

                    color:#ffffff;
                    border-color:#2563eb;
                    box-shadow:0 7px 18px rgba(37,99,235,0.20);

                }

                #drawHistoryWinners > div {

                    min-width:0;
                    padding:22px;
                    border:1px solid #e5e7eb;
                    border-radius:18px;
                    background:#ffffff;
                    box-sizing:border-box;
                    box-shadow:0 7px 18px rgba(0,0,0,0.05);

                }

                #drawHistoryWinners h3 {

                    margin:0 0 16px;
                    color:#f43f5e;
                    font-size:23px;
                    line-height:1.2;

                }

                #drawHistoryWinners p {

                    margin:7px 0;
                    font-size:15px;
                    line-height:1.4;
                    overflow-wrap:anywhere;

                }

                #drawHistoryWinners strong {

                    color:#172554;

                }

            `;


        document.head.appendChild(
            style
        );

    }


    // --------------------------------------------------------
    // HIDE OLD LONG TABLE
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
// GET HISTORY DATE KEY
// ============================================================
// For a date-specific draw:
//     draw_scope = 2026-09-15
//
// For Draw All Dates:
//     draw_scope = all
//
// For old history rows where draw_scope is NULL:
//     fall back to draw_date.
//
// This is the part that fixes the synchronization problem.
// ============================================================


function getHistoryDateKey(
    draw
) {

    const scope =
        String(
            draw?.draw_scope ||
            ""
        ).trim();


    if (
        scope &&
        scope !== "all" &&
        /^\d{4}-\d{2}-\d{2}$/.test(
            scope
        )
    ) {

        return scope;

    }


    return String(
        draw?.draw_date ||
        ""
    ).trim() || null;

}


// ============================================================
// GET HISTORY DRAW GROUP KEY
// ============================================================


function getHistoryDrawGroup(
    draw
) {

    return String(
        draw?.draw_number ||
        ""
    ).trim();

}


// ============================================================
// GET HISTORY RECORDS FOR SELECTED DATE
// ============================================================


function getHistoryForSelectedDate() {

    if (
        !selectedHistoryDate
    ) {

        return [];

    }


    return allDrawHistory.filter(
        function(draw) {

            return (
                getHistoryDateKey(
                    draw
                ) ===
                selectedHistoryDate
            );

        }
    );

}


// ============================================================
// RENDER HISTORY DATE TABS
// ============================================================


function renderHistoryDateTabs(
    dateTabs,
    uniqueDates
) {

    dateTabs.innerHTML =
        "";


    uniqueDates.forEach(
        function(dateKey) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.textContent =
                formatDateForDisplay(
                    dateKey
                );


            button.className =
                (
                    selectedHistoryDate ===
                    dateKey
                        ? "active"
                        : ""
                );


            button.addEventListener(
                "click",
                function() {

                    selectHistoryDate(
                        dateKey
                    );

                }
            );


            dateTabs.appendChild(
                button
            );

        }
    );

}


// ============================================================
// SELECT HISTORY DATE
// ============================================================


function selectHistoryDate(
    dateKey
) {

    selectedHistoryDate =
        dateKey;


    selectedHistoryDrawNumber =
        null;


    const containers =
        ensureHistoryContainers();


    if (!containers) {

        return;

    }


    renderHistoryDateTabs(
        containers.dateTabs,
        getUniqueHistoryDates()
    );


    renderHistoryDrawTabs(
        containers.drawTabs
    );


    renderSelectedHistoryDraw();

}


// ============================================================
// GET UNIQUE HISTORY DATES
// ============================================================


function getUniqueHistoryDates() {

    const dates =
        Array.from(
            new Set(
                allDrawHistory
                    .map(
                        function(draw) {

                            return getHistoryDateKey(
                                draw
                            );

                        }
                    )
                    .filter(Boolean)
            )
        );


    return dates.sort().reverse();

}


// ============================================================
// GET DRAW NUMBERS FOR SELECTED HISTORY DATE
// ============================================================


function getDrawNumbersForSelectedHistoryDate() {

    const selectedRecords =
        getHistoryForSelectedDate();


    const drawNumbers =
        Array.from(
            new Set(
                selectedRecords
                    .map(
                        function(draw) {

                            return getHistoryDrawGroup(
                                draw
                            );

                        }
                    )
                    .filter(Boolean)
            )
        );


    return drawNumbers.sort(
        function(a, b) {

            return Number(b) -
                Number(a);

        }
    );

}


// ============================================================
// RENDER DRAW NUMBER BUTTONS
// ============================================================


function renderHistoryDrawTabs(
    drawTabs
) {

    drawTabs.innerHTML =
        "";


    const drawNumbers =
        getDrawNumbersForSelectedHistoryDate();


    if (
        !drawNumbers.length
    ) {

        return;

    }


    drawNumbers.forEach(
        function(drawNumber) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.textContent =
                `Draw ${drawNumber}`;


            button.className =
                (
                    String(
                        selectedHistoryDrawNumber
                    ) ===
                    String(
                        drawNumber
                    )
                        ? "active"
                        : ""
                );


            button.addEventListener(
                "click",
                function() {

                    selectHistoryDraw(
                        drawNumber
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
// SELECT HISTORY DRAW
// ============================================================


function selectHistoryDraw(
    drawNumber
) {

    selectedHistoryDrawNumber =
        drawNumber;


    const containers =
        ensureHistoryContainers();


    if (!containers) {

        return;

    }


    renderHistoryDrawTabs(
        containers.drawTabs
    );


    renderSelectedHistoryDraw();

}


// ============================================================
// RENDER SELECTED HISTORY DRAW
// ============================================================


function renderSelectedHistoryDraw() {

    const containers =
        ensureHistoryContainers();


    if (!containers) {

        return;

    }


    const {
        summary,
        winners
    } =
        containers;


    const selectedRecords =
        getHistoryForSelectedDate();


    const drawNumbers =
        getDrawNumbersForSelectedHistoryDate();


    if (
        !selectedRecords.length
    ) {

        summary.innerHTML =
            `
                No draws have been conducted for this date.
            `;


        winners.innerHTML =
            "";


        return;

    }


    if (
        !selectedHistoryDrawNumber ||
        !drawNumbers.some(
            function(number) {

                return String(
                    number
                ) === String(
                    selectedHistoryDrawNumber
                );

            }
        )
    ) {

        selectedHistoryDrawNumber =
            drawNumbers[0];

    }


    renderHistoryDrawTabs(
        containers.drawTabs
    );


    const selectedDrawRecords =
        selectedRecords
            .filter(
                function(draw) {

                    return String(
                        getHistoryDrawGroup(
                            draw
                        )
                    ) === String(
                        selectedHistoryDrawNumber
                    );

                }
            )
            .sort(
                function(a, b) {

                    return Number(
                        a.id
                    ) -
                    Number(
                        b.id
                    );

                }
            );


    const displayDate =
        formatDateForDisplay(
            selectedHistoryDate
        );


    summary.innerHTML =
        `
            <strong>
                ${escapeHTML(
                    displayDate
                )}
            </strong>

            &nbsp; • &nbsp;

            ${drawNumbers.length}
            draw${drawNumbers.length === 1 ? "" : "s"}

            &nbsp; • &nbsp;

            Showing
            <strong>
                Draw ${escapeHTML(
                    selectedHistoryDrawNumber
                )}
            </strong>
        `;


    if (
        !selectedDrawRecords.length
    ) {

        winners.innerHTML =
            `
                <div
                    style="
                        grid-column:1 / -1;
                        text-align:center;
                    "
                >
                    No winner records found for this draw.
                </div>
            `;


        return;

    }


    const medals =
        [
            "🥇",
            "🥈",
            "🥉"
        ];


    winners.innerHTML =
        selectedDrawRecords
            .slice(
                0,
                3
            )
            .map(
                function(
                    winner,
                    index
                ) {

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
                                    winner.winner_registration_id ||
                                    "-"
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

                        </div>
                    `;

                }
            )
            .join(
                ""
            );

}


// ============================================================
// LOAD DRAW HISTORY
// ============================================================


async function loadDrawHistory() {

    if (
        !isAdminAuthenticated
    ) {

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


    summary.innerHTML =
        "Loading draw history...";


    drawTabs.innerHTML =
        "";


    winners.innerHTML =
        "";


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
                            false
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
                "DRAW HISTORY FETCH ERROR:",
                error
            );


            dateTabs.innerHTML =
                "";


            drawTabs.innerHTML =
                "";


            summary.innerHTML =
                "Unable to load draw history.";


            winners.innerHTML =
                "";


            return;

        }


        allDrawHistory =
            data || [];


        if (
            !allDrawHistory.length
        ) {

            dateTabs.innerHTML =
                "";


            drawTabs.innerHTML =
                "";


            summary.innerHTML =
                "No draw history available.";


            winners.innerHTML =
                "";


            selectedHistoryDate =
                null;


            selectedHistoryDrawNumber =
                null;


            return;

        }


        const uniqueDates =
            getUniqueHistoryDates();


        // ----------------------------------------------------
        // IMPORTANT:
        // Keep currently selected date if it still exists.
        // Otherwise use latest available history date.
        // ----------------------------------------------------


        if (
            !selectedHistoryDate ||
            !uniqueDates.includes(
                selectedHistoryDate
            )
        ) {

            selectedHistoryDate =
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


        console.log(
            "Draw history synchronized successfully:",
            allDrawHistory.length,
            "winner records"
        );

    } catch (error) {

        console.error(
            "DRAW HISTORY EXCEPTION:",
            error
        );


        dateTabs.innerHTML =
            "";


        drawTabs.innerHTML =
            "";


        summary.innerHTML =
            "Unable to load draw history.";


        winners.innerHTML =
            "";

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
    // DOWNLOAD PARTICIPANTS
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
