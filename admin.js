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


        if (parts.length !== 3) {

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


function getAvailableDateScopes(
    participants
) {

    const dates =
        new Set();


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
// LOGIN / PAGE STATE
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


    const password =
        getElement(
            "adminPassword"
        );


    if (password) {

        password.value =
            "";

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
                    "id, created_at, registration_id, name, phone, area, city, source, photo_url"
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
// FILTER PARTICIPANTS BY SELECTED SCOPE
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


    await applySelectedDrawScope();

}


// ============================================================
// APPLY SELECTED SCOPE
// ============================================================


async function applySelectedDrawScope() {

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


    clearSearchInput();


    await restoreCurrentScopeWinner();

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

        selectedScopeCount.innerHTML = `
            Participants in selected scope:
            <strong>
                ${participants.length}
            </strong>
        `;

    }

}


// ============================================================
// SELECTED SCOPE DISPLAY
// ============================================================


function updateSelectedScopeUI(
    participants
) {

    const selectedElement =
        getElement(
            "selectedDrawScope"
        );


    if (!selectedElement) {

        return;

    }


    selectedElement.textContent =
        "Selected: " +
        formatDateForDisplay(
            selectedDrawScope
        );


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


    // --------------------------------------------------------
    // DRAW ALL DATES
    // --------------------------------------------------------


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


    // --------------------------------------------------------
    // DATE TABS
    // --------------------------------------------------------


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
// SELECT DATE SCOPE
// ============================================================


async function selectDrawScope(
    drawScope
) {

    selectedDrawScope =
        drawScope ||
        "all";


    renderDrawScopeTabs();


    await applySelectedDrawScope();

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

        participantList.innerHTML = `
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
// VIEW / SEARCH
// ============================================================


async function viewParticipants() {

    await loadParticipants();

}


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


    displayParticipants(
        currentParticipants
    );


    updateParticipantCount(
        currentParticipants
    );

}


// ============================================================
// DRAW EDGE FUNCTION
// ============================================================


async function callDrawFunction(
    action
) {

    try {

        const {
            data: {
                session
            }
        } =
            await supabaseClient.auth.getSession();


        if (
            !session?.access_token
        ) {

            return {

                success:
                    false,

                error:
                    "Your admin session has expired. Please login again."

            };

        }


        const response =
            await fetch(
                `${SUPABASE_URL}/functions/v1/draw-winner`,
                {
                    method:
                        "POST",

                    headers:
                        {
                            "Authorization":
                                `Bearer ${session.access_token}`,

                            "apikey":
                                SUPABASE_KEY,

                            "Content-Type":
                                "application/json"
                        },

                    body:
                        JSON.stringify(
                            {
                                action:
                                    action,

                                draw_scope:
                                    selectedDrawScope
                            }
                        )
                }
            );


        let result =
            null;


        try {

            result =
                await response.json();

        } catch {

            result =
                null;

        }


        if (
            !response.ok
        ) {

            return {

                success:
                    false,

                status:
                    response.status,

                error:
                    result?.error ||
                    "The draw operation could not be completed."

            };

        }


        return (
            result ||
            {
                success:
                    false,

                error:
                    "Empty response from draw service."
            }
        );

    } catch (error) {

        console.error(
            "Draw function request error:",
            error
        );


        return {

            success:
                false,

            error:
                "Unable to contact the secure draw service."

        };

    }

}


// ============================================================
// DRAW STATUS
// ============================================================


async function getCurrentDrawStatus() {

    return await callDrawFunction(
        "status"
    );

}


// ============================================================
// DRAW MODAL
// ============================================================


function openDrawModal(
    action
) {

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
        action;


    const selectedName =
        formatDateForDisplay(
            selectedDrawScope
        );


    if (
        action ===
        "new"
    ) {

        if (message) {

            message.textContent =
                `Are you sure you want to draw 3 winners from ${selectedName}?`;

        }


        if (confirmButton) {

            confirmButton.textContent =
                "🎉 Draw Winners";

        }

    } else {

        if (message) {

            message.textContent =
                `A draw already exists for ${selectedName}.`;

        }


        if (confirmButton) {

            confirmButton.textContent =
                "Draw Winners";

        }

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
        !status.success
    ) {

        alert(
            status.error ||
            "Unable to check the current draw."
        );

        return;

    }


    if (
        status.completed
    ) {

        alert(
            `The draw for ${formatDateForDisplay(selectedDrawScope)} has already been completed. Reset this draw before selecting new winners.`
        );


        displayWinners(
            status.winners ||
            []
        );


        return;

    }


    openDrawModal(
        "new"
    );

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
            !result.success
        ) {

            alert(
                result.error ||
                "Unable to complete the lucky draw."
            );

            return;

        }


        displayWinners(
            result.winners ||
            []
        );


        await loadParticipants();


        await restoreCurrentScopeWinner();

    } catch (error) {

        console.error(
            "Confirm draw error:",
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
                "🎉 Draw Winners";

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
        !winners ||
        !winners.length
    ) {

        if (winnerResult) {

            winnerResult.innerHTML = `
                <p>
                    No winner selected yet.
                </p>
            `;

        }

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
                                ${medals[index]}
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

        winnerResult.innerHTML = `
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
            `There is no completed draw to reset for ${formatDateForDisplay(selectedDrawScope)}.`
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


        /*
         * IMPORTANT:
         *
         * There is intentionally NO success alert here.
         *
         * The reset operation is complete and the UI
         * immediately reflects the reset state.
         */


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
// DRAW HISTORY
// ============================================================


async function loadDrawHistory() {

    if (
        !isAdminAuthenticated
    ) {

        return;

    }


    const historyList =
        getElement(
            "drawHistoryList"
        );


    if (!historyList) {

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
                .select(
                    "id, draw_number, draw_date, draw_time, draw_scope, winner_name, winner_registration_id, winner_phone"
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
                "Draw history error:",
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
            !data.length
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
// INLINE HTML FUNCTIONS
// ============================================================


window.showAdminSection =
    showAdminSection;


window.loadDrawHistory =
    loadDrawHistory;


window.downloadDrawHistory =
    downloadDrawHistory;


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
                    "draw_number, draw_date, draw_time, draw_scope, winner_name, winner_registration_id, winner_phone"
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
                    wch:
                        12
                },

                {
                    wch:
                        15
                },

                {
                    wch:
                        15
                },

                {
                    wch:
                        18
                },

                {
                    wch:
                        28
                },

                {
                    wch:
                        22
                },

                {
                    wch:
                        18
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


    const downloadHistoryButton =
        getElement(
            "downloadHistoryButton"
        );


    if (downloadHistoryButton) {

        /*
         * Clone the button so any old inline/listener
         * handler cannot cause duplicate downloads.
         */

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
