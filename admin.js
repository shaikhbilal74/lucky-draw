// ============================================================
// LUCKY DRAW ADMIN DASHBOARD
// SECURE SUPABASE AUTH + ADMIN AUTHORIZATION
// SERVER-SIDE DRAW + SECURE RESET + REALTIME PARTICIPANTS
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

let participantRealtimeChannel = null;

let currentParticipants = [];

let isAdminAuthenticated = false;

let isInitializing = true;

let dashboardLoadInProgress = false;

let drawAction = "new";


// ============================================================
// SECURITY HELPER
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
// VERIFY ADMIN ACCESS
// ============================================================

async function verifyAdminAccess() {

    try {

        const {
            data: {
                user
            },
            error: userError
        } = await supabaseClient.auth.getUser();


        if (userError) {

            console.error(
                "AUTH USER ERROR:",
                userError
            );

            return false;

        }


        if (!user) {

            console.error(
                "No authenticated Supabase user."
            );

            return false;

        }


        console.log(
            "Authenticated user:",
            user.id,
            user.email
        );


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
                "ADMIN TABLE ERROR:",
                error
            );

            return false;

        }


        if (!data) {

            console.error(
                "ADMIN CHECK FAILED.",
                "User exists in Auth but is NOT present in admin_users."
            );

            return false;

        }


        if (data.user_id !== user.id) {

            console.error(
                "ADMIN UUID MISMATCH."
            );

            return false;

        }


        console.log(
            "ADMIN AUTHORIZATION SUCCESS:",
            user.email
        );


        return true;

    } catch (error) {

        console.error(
            "ADMIN VERIFICATION EXCEPTION:",
            error
        );

        return false;

    }

}


// ============================================================
// SHOW LOGIN PAGE
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


    const password =
        getElement("adminPassword");


    if (password) {

        password.value = "";

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
            data: {
                user
            }
        } = await supabaseClient.auth.getUser();


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

        console.log(
            "Attempting Supabase login..."
        );


        const {
            data,
            error
        } = await supabaseClient.auth.signInWithPassword({

            email: email,

            password: password

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

            console.error(
                "Login succeeded but no user was returned."
            );


            if (loginError) {

                loginError.textContent =
                    "Unable to verify your account.";

            }

            return;

        }


        console.log(
            "Password authentication successful:",
            data.user.id
        );


        const isAdmin =
            await verifyAdminAccess();


        if (!isAdmin) {

            console.error(
                "Authenticated user is not authorized as admin."
            );


            await supabaseClient.auth.signOut();


            if (loginError) {

                loginError.textContent =
                    "Access denied. This account is not an authorized administrator.";

            }

            return;

        }


        console.log(
            "Admin login successful."
        );


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
        } = await supabaseClient.auth.signOut();


        if (error) {

            console.error(
                "LOGOUT ERROR:",
                error
            );

        }

    } catch (error) {

        console.error(
            "LOGOUT EXCEPTION:",
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
// GET PARTICIPANTS
// ============================================================

async function getParticipants() {

    if (!isAdminAuthenticated) {

        return [];

    }


    try {

        const {
            data,
            error
        } = await supabaseClient
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
                "PARTICIPANT FETCH ERROR:",
                error
            );

            return [];

        }


        return data || [];

    } catch (error) {

        console.error(
            "PARTICIPANT FETCH EXCEPTION:",
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


    displayParticipants(
        participants
    );


    updateParticipantCount(
        participants
    );

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

                }
            )
            .subscribe(
                function(status) {

                    console.log(
                        "Realtime status:",
                        status
                    );

                }
            );

}


// ============================================================
// STOP REALTIME
// ============================================================

async function stopParticipantRealtime() {

    if (!participantRealtimeChannel) {

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


    participantRealtimeChannel = null;

}


// ============================================================
// SOURCE
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
        getElement(
            "participantList"
        );


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
                            participant.name || "-"
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            participant.phone || "-"
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            participant.area || "-"
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            participant.city || "-"
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

    await loadParticipants();

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
                    )
                        .toLowerCase();


                return (

                    String(
                        participant.name || ""
                    )
                        .toLowerCase()
                        .includes(searchValue)

                    ||

                    String(
                        participant.phone || ""
                    )
                        .toLowerCase()
                        .includes(searchValue)

                    ||

                    String(
                        participant.registration_id || ""
                    )
                        .toLowerCase()
                        .includes(searchValue)

                    ||

                    String(
                        participant.area || ""
                    )
                        .toLowerCase()
                        .includes(searchValue)

                    ||

                    String(
                        participant.city || ""
                    )
                        .toLowerCase()
                        .includes(searchValue)

                    ||

                    source.includes(searchValue)

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

        searchInput.value = "";

    }


    await loadParticipants();

}


// ============================================================
// DRAW MODAL
// ============================================================

function openDrawModal() {

    const modal =
        getElement("drawModal");

    const message =
        getElement("drawModalMessage");

    const confirmButton =
        getElement("confirmDrawButton");


    drawAction =
        "new";


    if (message) {

        message.textContent =
            "Are you sure you want to draw a winner?";

    }


    if (confirmButton) {

        confirmButton.textContent =
            "🎉 Draw Winner";

    }


    if (modal) {

        modal.classList.add("show");

    }

}


// ============================================================
// CLOSE DRAW MODAL
// ============================================================

function closeDrawModal() {

    const modal =
        getElement("drawModal");


    if (modal) {

        modal.classList.remove("show");

    }

}


// ============================================================
// DRAW WINNER
// ============================================================

async function drawWinner() {

    if (!isAdminAuthenticated) {

        alert(
            "Administrator authentication is required."
        );

        return;

    }


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


    openDrawModal();

}


// ============================================================
// CONFIRM DRAW
// ============================================================

async function confirmDraw() {

    closeDrawModal();

    await selectNewWinner();

}


// ============================================================
// SELECT NEW WINNER
// SERVER-SIDE ONLY
// ============================================================

async function selectNewWinner() {

    if (!isAdminAuthenticated) {

        alert(
            "Administrator authentication is required."
        );

        return;

    }


    try {

        const drawButton =
            getElement(
                "drawWinnerButton"
            );


        if (drawButton) {

            drawButton.disabled = true;

            drawButton.textContent =
                "🎲 Drawing...";

        }


        // ====================================================
        // REMEMBER THE WINNER THAT WAS RESET
        // ====================================================

        const previousWinnerId =
            localStorage.getItem(
                "previousLuckyDrawWinnerId"
            );


        // ====================================================
        // MAXIMUM RETRIES
        // ====================================================
        //
        // If the server randomly returns the same winner
        // that was just reset, request another server-side
        // draw.
        //
        // This keeps the actual winner selection server-side.
        // ====================================================

        const MAX_DRAW_ATTEMPTS = 20;


        let selectedWinner = null;

        let lastResponse = null;


        for (
            let attempt = 1;
            attempt <= MAX_DRAW_ATTEMPTS;
            attempt++
        ) {

            console.log(
                `Calling secure draw-winner Edge Function... Attempt ${attempt}`
            );


            const {
                data,
                error
            } = await supabaseClient.functions.invoke(
                "draw-winner",
                {
                    body: {
                        action: "draw"
                    }
                }
            );


            if (error) {

                console.error(
                    "DRAW WINNER FUNCTION ERROR:",
                    error
                );


                let message =
                    "Unable to draw winner. Please try again.";


                if (
                    error.context
                ) {

                    try {

                        const errorBody =
                            await error.context.json();

                        if (
                            errorBody?.error
                        ) {

                            message =
                                errorBody.error;

                        }

                    } catch (_) {

                        // Ignore response parsing errors.

                    }

                }


                alert(message);

                return;

            }


            if (!data) {

                console.error(
                    "DRAW FUNCTION RETURNED NO DATA."
                );


                alert(
                    "The server returned no response."
                );

                return;

            }


            if (
                data.success !== true
            ) {

                console.error(
                    "DRAW FUNCTION FAILED:",
                    data
                );


                alert(
                    data.error ||
                    "The server could not complete the draw."
                );

                return;

            }


            if (!data.winner) {

                console.error(
                    "DRAW FUNCTION DID NOT RETURN WINNER:",
                    data
                );


                alert(
                    "The server did not return a winner."
                );

                return;

            }


            lastResponse =
                data;


            const newWinnerId =
                data.winner.registration_id ||
                data.winner.id ||
                "";


            // =================================================
            // FIRST DRAW OR NO PREVIOUS WINNER
            // =================================================

            if (
                !previousWinnerId
            ) {

                selectedWinner =
                    data.winner;

                break;

            }


            // =================================================
            // DIFFERENT PARTICIPANT
            // =================================================

            if (
                String(newWinnerId) !==
                String(previousWinnerId)
            ) {

                selectedWinner =
                    data.winner;

                break;

            }


            // =================================================
            // SAME PARTICIPANT
            // =================================================

            console.warn(
                "The server selected the previous winner again.",
                "Requesting another draw..."
            );

        }


        // ====================================================
        // SAFETY CHECK
        // ====================================================

        if (!selectedWinner) {

            console.error(
                "Could not select a different winner after multiple attempts.",
                lastResponse
            );


            alert(
                "The previous winner was selected again. Please press Draw Winner once more."
            );

            return;

        }


        // ====================================================
        // SAVE CURRENT WINNER AS THE PREVIOUS WINNER
        // ====================================================
        //
        // This is important for the next reset.
        // ====================================================

        const selectedWinnerId =
            selectedWinner.registration_id ||
            selectedWinner.id ||
            "";


        if (selectedWinnerId) {

            localStorage.setItem(
                "currentLuckyDrawWinnerId",
                String(selectedWinnerId)
            );

        }


        // ====================================================
        // SHOW WINNER DIRECTLY
        // ====================================================
        //
        // No success popup.
        // ====================================================

        displayWinner(
            selectedWinner
        );


        console.log(
            "Winner selected securely by server:",
            selectedWinner
        );

    } catch (error) {

        console.error(
            "SECURE DRAW EXCEPTION:",
            error
        );


        alert(
            "An error occurred while drawing the winner."
        );

    } finally {

        const drawButton =
            getElement(
                "drawWinnerButton"
            );


        if (drawButton) {

            drawButton.disabled = false;

            drawButton.textContent =
                "🎲 Draw Winner";

        }

    }

}


// ============================================================
// DISPLAY WINNER
// ============================================================

function displayWinner(
    winner
) {

    const winnerResult =
        getElement(
            "winnerResult"
        );


    if (!winnerResult || !winner) {

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
            <strong>Registration ID:</strong>
            ${escapeHTML(registrationId)}
        </p>

        <p>
            <strong>Name:</strong>
            ${escapeHTML(winner.name || "-")}
        </p>

        <p>
            <strong>Phone:</strong>
            ${escapeHTML(winner.phone || "-")}
        </p>

        <p>
            <strong>Area:</strong>
            ${escapeHTML(winner.area || "-")}
        </p>

        <p>
            <strong>City:</strong>
            ${escapeHTML(winner.city || "-")}
        </p>

    `;

}


// ============================================================
// RESET DRAW
// CUSTOM COLORFUL CONFIRMATION BOX
// ============================================================

function resetDraw() {

    if (!isAdminAuthenticated) {

        alert(
            "Administrator authentication is required."
        );

        return;

    }


    const modal =
        getElement("resetModal");

    const message =
        getElement("resetModalMessage");

    const confirmButton =
        getElement("confirmResetButton");

    const cancelButton =
        getElement("cancelResetButton");


    if (!modal) {

        console.error(
            "Reset modal element was not found."
        );

        return;

    }


    // --------------------------------------------------------
    // OPEN RESET MODAL
    // --------------------------------------------------------

    modal.classList.add("show");

    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.zIndex = "999999";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.padding = "20px";
    modal.style.background =
        "rgba(15, 23, 42, 0.68)";
    modal.style.backdropFilter =
        "blur(7px)";


    // --------------------------------------------------------
    // FIND MODAL BOX
    // --------------------------------------------------------

    const modalBox =
        modal.querySelector(
            ".modal-content"
        ) ||
        modal.querySelector(
            ".modal-dialog"
        ) ||
        modal.firstElementChild;


    if (modalBox) {

        modalBox.style.width = "100%";
        modalBox.style.maxWidth = "580px";
        modalBox.style.background = "#ffffff";
        modalBox.style.borderRadius = "28px";
        modalBox.style.padding = "38px";
        modalBox.style.boxSizing = "border-box";
        modalBox.style.textAlign = "center";
        modalBox.style.boxShadow =
            "0 25px 70px rgba(0,0,0,0.30)";
        modalBox.style.borderTop =
            "7px solid #ff3d71";

    }


    // --------------------------------------------------------
    // RESET MESSAGE
    // --------------------------------------------------------

    if (message) {

        message.innerHTML = `

            <div style="
                text-align:center;
                padding:5px 5px 18px;
            ">

                <div style="
                    width:92px;
                    height:92px;
                    margin:0 auto 22px;
                    border-radius:50%;
                    background:
                        linear-gradient(
                            135deg,
                            #ff3d71,
                            #ff9d00
                        );
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-size:46px;
                    box-shadow:
                        0 12px 28px
                        rgba(255,61,113,0.28);
                ">
                    🔄
                </div>

                <h2 style="
                    margin:0 0 14px;
                    font-size:34px;
                    font-weight:800;
                    color:#0f172a;
                ">
                    Reset Lucky Draw?
                </h2>

                <p style="
                    margin:0 auto;
                    max-width:470px;
                    font-size:18px;
                    line-height:1.6;
                    color:#334155;
                ">
                    Are you sure you want to reset the lucky draw?
                    <br><br>
                    The current winner will be removed and
                    a new draw can be performed.
                </p>

            </div>

        `;

    }


    // --------------------------------------------------------
    // CONFIRM RESET BUTTON
    // --------------------------------------------------------

    if (confirmButton) {

        confirmButton.textContent =
            "🔄 Reset Draw";

        confirmButton.style.border = "none";
        confirmButton.style.borderRadius = "13px";
        confirmButton.style.padding = "15px 30px";
        confirmButton.style.minWidth = "160px";
        confirmButton.style.background =
            "linear-gradient(135deg, #ff3d71, #ff9d00)";
        confirmButton.style.color = "#ffffff";
        confirmButton.style.fontSize = "17px";
        confirmButton.style.fontWeight = "700";
        confirmButton.style.cursor = "pointer";
        confirmButton.style.boxShadow =
            "0 8px 20px rgba(255,61,113,0.25)";

    }


    // --------------------------------------------------------
    // CANCEL BUTTON
    // --------------------------------------------------------

    if (cancelButton) {

        cancelButton.textContent =
            "Cancel";

        cancelButton.style.border = "none";
        cancelButton.style.borderRadius = "13px";
        cancelButton.style.padding = "15px 30px";
        cancelButton.style.minWidth = "125px";
        cancelButton.style.background =
            "#64748b";
        cancelButton.style.color =
            "#ffffff";
        cancelButton.style.fontSize = "17px";
        cancelButton.style.fontWeight = "700";
        cancelButton.style.cursor = "pointer";

    }

}


// ============================================================
// CLOSE RESET MODAL
// ============================================================

function closeResetModal() {

    const modal =
        getElement("resetModal");


    if (modal) {

        modal.classList.remove("show");

        modal.style.display = "none";

    }

}


// ============================================================
// CONFIRM RESET
// SECURE EDGE FUNCTION
// ============================================================

async function confirmResetDraw() {

    if (!isAdminAuthenticated) {

        alert(
            "Administrator authentication is required."
        );

        return;

    }


    // ========================================================
    // REMEMBER CURRENT WINNER BEFORE RESET
    // ========================================================
    //
    // This is the key fix.
    //
    // We keep the winner's ID even though the server-side
    // winner is being reset.
    //
    // The next draw will make sure this participant is not
    // selected again.
    // ========================================================

    try {

        const {
            data: statusData,
            error: statusError
        } =
            await supabaseClient.functions.invoke(
                "draw-winner",
                {
                    body: {
                        action: "status"
                    }
                }
            );


        if (
            !statusError &&
            statusData?.winner
        ) {

            const currentWinnerId =
                statusData.winner.registration_id ||
                statusData.winner.id ||
                "";


            if (currentWinnerId) {

                localStorage.setItem(
                    "previousLuckyDrawWinnerId",
                    String(currentWinnerId)
                );

            }

        }

    } catch (error) {

        console.error(
            "Unable to retrieve current winner before reset:",
            error
        );

    }


    // ========================================================
    // CLOSE RESET MODAL
    // ========================================================

    closeResetModal();


    const resetButton =
        getElement(
            "resetDrawButton"
        );


    try {

        if (resetButton) {

            resetButton.disabled = true;

            resetButton.textContent =
                "🔄 Resetting...";

        }


        console.log(
            "Calling secure draw-winner Edge Function for reset..."
        );


        const {
            data,
            error
        } = await supabaseClient.functions.invoke(
            "draw-winner",
            {
                body: {
                    action: "reset"
                }
            }
        );


        if (error) {

            console.error(
                "RESET DRAW FUNCTION ERROR:",
                error
            );


            let message =
                "Unable to reset the draw. Please try again.";


            if (error.context) {

                try {

                    const errorBody =
                        await error.context.json();

                    if (errorBody?.error) {

                        message =
                            errorBody.error;

                    }

                } catch (_) {

                    // Ignore response parsing errors.

                }

            }


            alert(message);

            return;

        }


        if (!data) {

            console.error(
                "RESET FUNCTION RETURNED NO DATA."
            );


            alert(
                "The server returned no response."
            );

            return;

        }


        if (data.success !== true) {

            console.error(
                "RESET DRAW FAILED:",
                data
            );


            alert(
                data.error ||
                "The server could not reset the draw."
            );

            return;

        }


        // ====================================================
        // CLEAR CURRENT WINNER FROM SCREEN
        // ====================================================

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


        console.log(
            "Lucky draw reset successfully."
        );


    } catch (error) {

        console.error(
            "SECURE RESET EXCEPTION:",
            error
        );


        alert(
            "An error occurred while resetting the draw."
        );

    } finally {

        if (resetButton) {

            resetButton.disabled = false;

            resetButton.textContent =
                "🔄 Reset Draw";

        }

    }

}


// ============================================================
// RESTORE WINNER
// ============================================================

async function restoreWinner() {

    if (!isAdminAuthenticated) {

        return;

    }


    const winnerResult =
        getElement("winnerResult");


    if (!winnerResult) {

        return;

    }


    try {

        winnerResult.innerHTML = `

            <p>
                Loading winner...
            </p>

        `;


        console.log(
            "Loading saved lucky draw winner..."
        );


        const {
            data,
            error
        } = await supabaseClient.functions.invoke(
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

            console.error(
                "WINNER RESTORE RETURNED NO DATA."
            );


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


        displayWinner(
            data.winner
        );


        console.log(
            "Saved winner restored successfully:",
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
// DOWNLOAD EXCEL
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
            "Excel export library is unavailable."
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

        { wch: 8 },
        { wch: 20 },
        { wch: 25 },
        { wch: 18 },
        { wch: 30 },
        { wch: 25 },
        { wch: 22 }

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
        getElement("viewParticipantsButton");


    if (viewButton) {

        viewButton.addEventListener(
            "click",
            viewParticipants
        );

    }


    const drawButton =
        getElement("drawWinnerButton");


    if (drawButton) {

        drawButton.addEventListener(
            "click",
            drawWinner
        );

    }


    const resetButton =
        getElement("resetDrawButton");


    if (resetButton) {

        resetButton.addEventListener(
            "click",
            resetDraw
        );

    }


    const downloadButton =
        getElement("downloadButton");


    if (downloadButton) {

        downloadButton.addEventListener(
            "click",
            downloadParticipants
        );

    }


    const searchButton =
        getElement("searchButton");


    if (searchButton) {

        searchButton.addEventListener(
            "click",
            searchParticipants
        );

    }


    const clearButton =
        getElement("clearSearchButton");


    if (clearButton) {

        clearButton.addEventListener(
            "click",
            clearSearch
        );

    }


    const searchInput =
        getElement("searchInput");


    if (searchInput) {

        searchInput.addEventListener(
            "input",
            performSearch
        );

    }


    const cancelDrawButton =
        getElement("cancelDrawButton");


    if (cancelDrawButton) {

        cancelDrawButton.addEventListener(
            "click",
            closeDrawModal
        );

    }


    const confirmDrawButton =
        getElement("confirmDrawButton");


    if (confirmDrawButton) {

        confirmDrawButton.addEventListener(
            "click",
            confirmDraw
        );

    }


    // Reset modal listeners

    const cancelResetButton =
        getElement("cancelResetButton");


    if (cancelResetButton) {

        cancelResetButton.addEventListener(
            "click",
            closeResetModal
        );

    }


    const confirmResetButton =
        getElement("confirmResetButton");


    if (confirmResetButton) {

        confirmResetButton.addEventListener(
            "click",
            confirmResetDraw
        );

    }

}


// ============================================================
// AUTH STATE LISTENER
// ============================================================

supabaseClient.auth.onAuthStateChange(
    function(event) {

        console.log(
            "Supabase auth event:",
            event
        );


        if (event === "SIGNED_OUT") {

            if (!isInitializing) {

                stopParticipantRealtime();

                showLoginPage();

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
        } = await supabaseClient.auth.getSession();


        if (!session) {

            showLoginPage();

            return;

        }


        console.log(
            "Existing Supabase session found."
        );


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

        isInitializing = false;

    }

}


// ============================================================
// START
// ============================================================

initializeAdmin();
