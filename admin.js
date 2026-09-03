// ============================================================
// LUCKY DRAW ADMIN DASHBOARD
// SECURE SUPABASE AUTH + ADMIN AUTHORIZATION + REALTIME
// ============================================================

const SUPABASE_URL = "https://mvwaanrbqjozxbncogzf.supabase.co";

// This is a Supabase publishable key.
// NEVER put a Supabase service_role/secret key in browser code.
const SUPABASE_KEY =
    "sb_publishable_-jVZOnMljZt3VqDkwHCf_g_o8GDU_6c";

const supabaseClient = window.supabase.createClient(
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

let drawAction = "new";

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
// ADMIN AUTHORIZATION
// ============================================================

async function verifyAdminAccess() {
    try {
        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

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
        } = await supabaseClient
            .from("admin_users")
            .select("user_id")
            .eq("user_id", user.id)
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

function showLoginPage(errorMessage = "") {

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

// ============================================================
// SHOW ADMIN DASHBOARD
// ============================================================

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

        await restoreWinner();

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
            await supabaseClient.auth.signInWithPassword({

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

async function loadParticipants() {

    if (!isAdminAuthenticated) {

        return;

    }

    const participants =
        await getParticipants();

    currentParticipants =
        participants;

    displayParticipants(
        participants
    );

    updateParticipantCount(
        participants
    );
}

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
                async (payload) => {

                    console.log(
                        "Live participant update:",
                        payload.eventType,
                        payload
                    );

                    await loadParticipants();

                    const searchInput =
                        getElement("searchInput");

                    if (
                        searchInput &&
                        searchInput.value.trim()
                    ) {

                        await performSearch();

                    }

                }
            )
            .subscribe(
                (status) => {

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
        photoSources.has(rawSource) ||
        Boolean(participant?.photo_url)
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
        getElement("participantList");

    if (!participantList) {

        return;

    }

    participantList.innerHTML = "";

    if (!participants.length) {

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
        (participant, index) => {

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
        getElement("searchInput");

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
            (participant) => {

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
                        .includes(searchValue)

                    ||

                    String(
                        participant.phone ||
                        ""
                    )
                        .toLowerCase()
                        .includes(searchValue)

                    ||

                    String(
                        participant.registration_id ||
                        ""
                    )
                        .toLowerCase()
                        .includes(searchValue)

                    ||

                    String(
                        participant.area ||
                        ""
                    )
                        .toLowerCase()
                        .includes(searchValue)

                    ||

                    String(
                        participant.city ||
                        ""
                    )
                        .toLowerCase()
                        .includes(searchValue)

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

async function searchParticipants() {

    await performSearch();

}

async function clearSearch() {

    const searchInput =
        getElement("searchInput");

    if (searchInput) {

        searchInput.value = "";

    }

    await loadParticipants();

}

// ============================================================
// DRAW
// ============================================================

function openDrawModal(
    action
) {

    const modal =
        getElement("drawModal");

    const message =
        getElement("drawModalMessage");

    const confirmButton =
        getElement("confirmDrawButton");

    drawAction =
        action;

    if (action === "new") {

        if (message) {

            message.textContent =
                "Are you sure you want to draw a winner?";

        }

        if (confirmButton) {

            confirmButton.textContent =
                "🎉 Draw Winner";

        }

    } else {

        if (message) {

            message.textContent =
                "A winner has already been selected. Do you want to replace the current winner?";

        }

        if (confirmButton) {

            confirmButton.textContent =
                "🔄 Draw New Winner";

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
        getElement("drawModal");

    if (modal) {

        modal.classList.remove(
            "show"
        );

    }
}

async function drawWinner() {

    const participants =
        await getParticipants();

    currentParticipants =
        participants;

    if (!participants.length) {

        alert(
            "No participants available for the Lucky Draw!"
        );

        return;

    }

    const existingWinner =
        localStorage.getItem(
            "luckyDrawWinner"
        );

    openDrawModal(
        existingWinner
            ? "again"
            : "new"
    );
}

async function confirmDraw() {

    closeDrawModal();

    await selectNewWinner();

}

async function selectNewWinner() {

    const participants =
        await getParticipants();

    if (!participants.length) {

        alert(
            "No participants available for the Lucky Draw!"
        );

        return;

    }

    const {
        data,
        error
    } =
        await supabaseClient.functions.invoke(
            "draw-winner",
            {
                body: {
                    action: "draw"
                }
            }
        );

    if (error) {

        console.error(
            "DRAW FUNCTION ERROR:",
            error
        );

        alert(
            "Unable to draw winner. Please try again."
        );

        return;

    }

    if (
        !data ||
        !data.success ||
        !data.winner
    ) {

        alert(
            data?.error ||
            "Unable to draw winner."
        );

        return;

    }

    localStorage.setItem(
        "luckyDrawWinner",
        JSON.stringify(
            data.winner
        )
    );

    displayWinner(
        data.winner
    );
}

function displayWinner(
    winner
) {

    const winnerResult =
        getElement("winnerResult");

    if (
        !winnerResult ||
        !winner
    ) {

        return;

    }

    const registrationId =
        winner.registration_id ||
        winner.id ||
        "-";

    winnerResult.innerHTML = `

        <h3>
            🎉 Congratulations!
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

    `;
}

// ============================================================
// RESET DRAW
// ============================================================

function resetDraw() {

    const modal =
        getElement("resetModal");

    if (modal) {

        modal.classList.add(
            "show"
        );

    }
}

function closeResetModal() {

    const modal =
        getElement("resetModal");

    if (modal) {

        modal.classList.remove(
            "show"
        );

    }
}

async function confirmResetDraw() {

    closeResetModal();

    const {
        data,
        error
    } =
        await supabaseClient.functions.invoke(
            "draw-winner",
            {
                body: {
                    action: "reset"
                }
            }
        );

    if (error) {

        console.error(
            "RESET FUNCTION ERROR:",
            error
        );

        alert(
            "Unable to reset the lucky draw. Please try again."
        );

        return;

    }

    if (
        !data ||
        data.success !== true
    ) {

        alert(
            data?.error ||
            "Unable to reset the lucky draw."
        );

        return;

    }

    localStorage.removeItem(
        "luckyDrawWinner"
    );

    const winnerResult =
        getElement("winnerResult");

    if (winnerResult) {

        winnerResult.innerHTML = `

            <p>
                No winner selected yet.
            </p>

        `;

    }

    console.log(
        "Lucky draw reset successfully."
    );
}

async function restoreWinner() {

    const winnerResult =
        getElement("winnerResult");

    if (!winnerResult) {

        return;

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
                        action: "status"
                    }
                }
            );

        if (error) {

            console.error(
                "WINNER RESTORE FUNCTION ERROR:",
                error
            );

            winnerResult.innerHTML = `

                <p>
                    Unable to load winner information.
                </p>

            `;

            return;

        }

        if (!data) {

            winnerResult.innerHTML = `

                <p>
                    Unable to load winner information.
                </p>

            `;

            return;

        }

        if (
            data.completed !== true ||
            !data.winner
        ) {

            winnerResult.innerHTML = `

                <p>
                    No winner selected yet.
                </p>

            `;

            return;

        }

        localStorage.setItem(
            "luckyDrawWinner",
            JSON.stringify(
                data.winner
            )
        );

        displayWinner(
            data.winner
        );

    } catch (error) {

        console.error(
            "WINNER RESTORE EXCEPTION:",
            error
        );

        winnerResult.innerHTML = `

            <p>
                Unable to load winner information.
            </p>

        `;

    }
}

// ============================================================
// DRAW HISTORY
// ============================================================

async function loadDrawHistory() {

    const historyList =
        getElement("drawHistoryList");

    if (!historyList) {

        return;

    }

    if (!isAdminAuthenticated) {

        historyList.innerHTML = `

            <tr>

                <td
                    colspan="6"
                    class="no-data"
                >
                    Administrator authentication is required.
                </td>

            </tr>

        `;

        return;

    }

    try {

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

        const {
            data,
            error
        } =
            await supabaseClient
                .from("draw_history")
                .select(`
                    draw_number,
                    draw_date,
                    draw_time,
                    winner_name,
                    winner_registration_id,
                    winner_phone
                `)
                .order(
                    "draw_number",
                    {
                        ascending: false
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
                        No draws have been conducted yet.
                    </td>

                </tr>

            `;

            return;

        }

        historyList.innerHTML = "";

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
// MAKE INLINE HTML EVENTS ACCESSIBLE
// ============================================================

window.showAdminSection =
    showAdminSection;

window.loadDrawHistory =
    loadDrawHistory;

// ============================================================
// DOWNLOAD DRAW HISTORY TO EXCEL
// ============================================================
//
// IMPORTANT:
// This function intentionally follows the SAME simple pattern
// as the working dashboard participant Excel function.
//
// It does NOT:
// - change the button HTML
// - change the button icon
// - disable the button
// - change the button text
// - require a page refresh
//
// It simply fetches draw_history and creates the Excel file.
// ============================================================

async function downloadDrawHistory() {

    if (!isAdminAuthenticated) {

        alert(
            "Administrator authentication is required."
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

    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from("draw_history")
                .select(`
                    draw_number,
                    draw_date,
                    draw_time,
                    winner_name,
                    winner_registration_id,
                    winner_phone
                `)
                .order(
                    "draw_number",
                    {
                        ascending: false
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
            data.length === 0
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

        worksheet["!cols"] = [

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
            "DRAW HISTORY EXCEL EXCEPTION:",
            error
        );

        alert(
            "An error occurred while downloading draw history."
        );

    }
}

// ============================================================
// EXCEL - PARTICIPANTS
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
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {

    const loginForm =
        getElement("loginForm");

    if (loginForm) {

        loginForm.addEventListener(
            "submit",
            loginAdmin
        );

    }

    const logoutButton =
        getElement("logoutButton");

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

    // --------------------------------------------------------
    // PARTICIPANT EXCEL BUTTON
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
    // DRAW HISTORY EXCEL BUTTON
    // --------------------------------------------------------

    const downloadHistoryButton =
        getElement(
            "downloadHistoryButton"
        );

    if (downloadHistoryButton) {

        downloadHistoryButton.addEventListener(
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
    async (
        event,
        session
    ) => {

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
