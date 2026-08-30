// ============================================================
// SUPABASE CONNECTION
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
// EDGE FUNCTION
// ============================================================

const OCR_FUNCTION_URL =
    `${SUPABASE_URL}/functions/v1/read-registration-form`;


// ============================================================
// ELEMENTS
// ============================================================

const registrationForm =
    document.getElementById("registrationForm");

const registrationImage =
    document.getElementById("registrationImage");

const selectedFileName =
    document.getElementById("selectedFileName");

const ocrStatus =
    document.getElementById("ocrStatus");

const ocrStatusIcon =
    document.getElementById("ocrStatusIcon");

const ocrStatusTitle =
    document.getElementById("ocrStatusTitle");

const ocrStatusText =
    document.getElementById("ocrStatusText");


// ============================================================
// ERROR MESSAGE
// ============================================================

function showError(message) {
    alert(message);
}


// ============================================================
// OCR STATUS
// ============================================================

function showOCRStatus(
    icon,
    title,
    message,
    statusClass = ""
) {
    if (!ocrStatus) return;

    ocrStatus.style.display = "flex";
    ocrStatus.className = "ocr-status";

    if (statusClass) {
        ocrStatus.classList.add(statusClass);
    }

    if (ocrStatusIcon) {
        ocrStatusIcon.innerText = icon;
    }

    if (ocrStatusTitle) {
        ocrStatusTitle.innerText = title;
    }

    if (ocrStatusText) {
        ocrStatusText.innerText = message;
    }
}


// ============================================================
// FILE → BASE64
// ============================================================

function fileToBase64(file) {
    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => {
            resolve(reader.result);
        };

        reader.onerror = () => {
            reject(
                new Error(
                    "Unable to read image file."
                )
            );
        };

        reader.readAsDataURL(file);
    });
}


// ============================================================
// FILL FORM FROM OCR
// ============================================================

function fillForm(data) {

    let fieldsFound = 0;


    // -------------------------
    // NAME
    // -------------------------

    if (
        data.name &&
        typeof data.name === "string"
    ) {
        const nameElement =
            document.getElementById("name");

        if (nameElement) {
            nameElement.value =
                data.name.trim();

            fieldsFound++;
        }
    }


    // -------------------------
    // PHONE
    // -------------------------

    if (
        data.phone &&
        typeof data.phone === "string"
    ) {
        const phoneElement =
            document.getElementById("phone");

        if (phoneElement) {

            const cleanPhone =
                data.phone.replace(
                    /\D/g,
                    ""
                );

            phoneElement.value =
                cleanPhone;

            fieldsFound++;
        }
    }


    // -------------------------
    // AREA
    // -------------------------

    if (
        data.area &&
        typeof data.area === "string"
    ) {
        const areaElement =
            document.getElementById("area");

        if (areaElement) {

            areaElement.value =
                data.area.trim();

            fieldsFound++;
        }
    }


    // -------------------------
    // CITY
    // -------------------------

    if (
        data.city &&
        typeof data.city === "string"
    ) {

        const citySelect =
            document.getElementById("city");

        if (citySelect) {

            const city =
                data.city.trim().toLowerCase();

            const matchingOption =
                Array.from(
                    citySelect.options
                ).find(
                    option =>
                        option.value
                            .trim()
                            .toLowerCase() === city
                );

            if (matchingOption) {

                citySelect.value =
                    matchingOption.value;

                fieldsFound++;
            }
        }
    }


    return fieldsFound;
}


// ============================================================
// OCR / REGISTRATION PHOTO READER
// ============================================================

async function readRegistrationForm(file) {

    try {

        showOCRStatus(
            "⏳",
            "Reading your form...",
            "Please wait while we read the registration details."
        );


        // --------------------------------------------
        // BASIC FILE SECURITY CHECK
        // --------------------------------------------

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {

            throw new Error(
                "Please upload a JPG, PNG, or WebP image."
            );
        }


        // 10 MB maximum
        const MAX_FILE_SIZE =
            10 * 1024 * 1024;

        if (file.size > MAX_FILE_SIZE) {

            throw new Error(
                "Image is too large. Maximum size is 10 MB."
            );
        }


        // --------------------------------------------
        // CONVERT IMAGE
        // --------------------------------------------

        const imageBase64 =
            await fileToBase64(file);


        console.log(
            "Sending image to OCR service..."
        );


        // --------------------------------------------
        // CALL EDGE FUNCTION
        // --------------------------------------------

        const response =
            await fetch(
                OCR_FUNCTION_URL,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "apikey":
                            SUPABASE_KEY,

                        "Authorization":
                            `Bearer ${SUPABASE_KEY}`
                    },

                    body: JSON.stringify({
                        image:
                            imageBase64,

                        mimeType:
                            file.type
                    })
                }
            );


        // --------------------------------------------
        // READ RESPONSE
        // --------------------------------------------

        const responseText =
            await response.text();


        console.log(
            "OCR FUNCTION RESPONSE:",
            responseText
        );


        let result;


        try {

            result =
                JSON.parse(
                    responseText
                );

        } catch {

            throw new Error(
                "The OCR service returned an invalid response."
            );
        }


        // --------------------------------------------
        // HTTP ERROR
        // --------------------------------------------

        if (!response.ok) {

            console.error(
                "OCR Edge Function error:",
                result
            );

            throw new Error(
                result.message ||
                "Unable to read the registration photo."
            );
        }


        // --------------------------------------------
        // OCR FAILURE
        // --------------------------------------------

        if (!result.success) {

            showOCRStatus(
                "!",
                "We couldn't read the form clearly.",
                result.message ||
                "Please use a clearer photo or enter the information manually.",
                "ocr-warning"
            );

            return;
        }


        // --------------------------------------------
        // EXTRACT DATA
        // --------------------------------------------

        const data =
            result.data || {};


        console.log(
            "Extracted registration data:",
            data
        );


        // --------------------------------------------
        // FILL FORM
        // --------------------------------------------

        const fieldsFound =
            fillForm(data);


        // --------------------------------------------
        // SUCCESS MESSAGE
        // --------------------------------------------

        if (fieldsFound >= 2) {

            showOCRStatus(
                "✓",
                "Details found!",
                "We've filled in the information we could read. Please check everything before registering.",
                "ocr-success"
            );

        } else {

            showOCRStatus(
                "!",
                "Some details could not be read.",
                "We've filled in what we could. Please check the form and complete any missing information.",
                "ocr-warning"
            );
        }


    } catch (error) {

        console.error(
            "OCR ERROR:",
            error
        );


        showOCRStatus(
            "!",
            "Unable to read the photo.",
            error.message ||
            "Please use a clear photo and enter the information manually.",
            "ocr-warning"
        );
    }
}


// ============================================================
// PHOTO UPLOAD
// ============================================================

if (registrationImage) {

    registrationImage.addEventListener(
        "change",
        async function () {

            const file =
                this.files[0];


            if (!file) {

                if (selectedFileName) {

                    selectedFileName.innerText =
                        "No file selected";
                }

                if (ocrStatus) {

                    ocrStatus.style.display =
                        "none";
                }

                return;
            }


            // ----------------------------------------
            // IMAGE TYPE CHECK
            // ----------------------------------------

            const allowedTypes = [
                "image/jpeg",
                "image/png",
                "image/webp"
            ];


            if (
                !allowedTypes.includes(
                    file.type
                )
            ) {

                showError(
                    "Please upload a JPG, PNG, or WebP image."
                );

                this.value = "";

                return;
            }


            // ----------------------------------------
            // FILE SIZE CHECK
            // ----------------------------------------

            const MAX_FILE_SIZE =
                10 * 1024 * 1024;


            if (
                file.size > MAX_FILE_SIZE
            ) {

                showError(
                    "Image is too large. Maximum size is 10 MB."
                );

                this.value = "";

                return;
            }


            // ----------------------------------------
            // DISPLAY FILE NAME
            // ----------------------------------------

            if (selectedFileName) {

                selectedFileName.innerText =
                    file.name;
            }


            // ----------------------------------------
            // OCR
            // ----------------------------------------

            await readRegistrationForm(
                file
            );
        }
    );
}


// ============================================================
// GENERATE REGISTRATION ID
// ============================================================
//
// NOTE:
// This is kept compatible with your current database.
// Later we should move ID generation to the database,
// because client-side ID generation can have race conditions.
// ============================================================

async function generateRegistrationId() {

    const {
        count,
        error
    } =
        await supabaseClient
            .from("Participants")
            .select(
                "registration_id",
                {
                    count: "exact",
                    head: true
                }
            );


    if (error) {

        console.error(
            "Error counting participants:",
            error
        );

        throw error;
    }


    const nextNumber =
        (count || 0) + 1;


    return (
        "LD-" +
        String(
            nextNumber
        ).padStart(
            4,
            "0"
        )
    );
}


// ============================================================
// REGISTRATION
// ============================================================

if (registrationForm) {

    registrationForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            // ----------------------------------------
            // PREVENT DOUBLE SUBMISSION
            // ----------------------------------------

            const submitButton =
                registrationForm.querySelector(
                    'button[type="submit"]'
                );


            if (submitButton) {

                if (
                    submitButton.disabled
                ) {
                    return;
                }

                submitButton.disabled =
                    true;

                submitButton.dataset.originalText =
                    submitButton.innerText;

                submitButton.innerText =
                    "Registering...";
            }


            try {

                // ------------------------------------
                // GET VALUES
                // ------------------------------------

                const name =
                    document
                        .getElementById("name")
                        .value
                        .trim();


                const phone =
                    document
                        .getElementById("phone")
                        .value
                        .trim();


                const area =
                    document
                        .getElementById("area")
                        .value
                        .trim();


                const city =
                    document
                        .getElementById("city")
                        .value;


                // ------------------------------------
                // PHOTO
                // ------------------------------------

                const photoWasUploaded =
                    registrationImage &&
                    registrationImage.files &&
                    registrationImage.files.length > 0;


                const registrationSource =
                    photoWasUploaded
                        ? "Photo Upload"
                        : "Manual Registration";


                // ------------------------------------
                // NAME VALIDATION
                // ------------------------------------

                const namePattern =
                    /^[A-Za-z ]+$/;


                if (
                    name.length < 2 ||
                    !namePattern.test(name)
                ) {

                    throw new Error(
                        "Name can contain letters and spaces only."
                    );
                }


                // ------------------------------------
                // PHONE VALIDATION
                // ------------------------------------

                const cleanPhone =
                    phone.replace(
                        /\D/g,
                        ""
                    );


                const phonePattern =
                    /^[6-9][0-9]{9}$/;


                if (
                    !phonePattern.test(
                        cleanPhone
                    )
                ) {

                    throw new Error(
                        "Please enter a valid 10-digit Indian mobile number."
                    );
                }


                // ------------------------------------
                // AREA VALIDATION
                // ------------------------------------

                if (
                    area.length < 2
                ) {

                    throw new Error(
                        "Please enter a valid area."
                    );
                }


                // ------------------------------------
                // CITY VALIDATION
                // ------------------------------------

                if (
                    !city
                ) {

                    throw new Error(
                        "Please select a city."
                    );
                }


                // ------------------------------------
                // DUPLICATE PHONE CHECK
                // ------------------------------------

                const {
                    data: existingParticipants,
                    error: duplicateError
                } =
                    await supabaseClient
                        .from("Participants")
                        .select("phone")
                        .eq(
                            "phone",
                            cleanPhone
                        )
                        .limit(1);


                if (duplicateError) {

                    console.error(
                        "Duplicate phone check failed:",
                        duplicateError
                    );

                    throw new Error(
                        "Unable to check registration. Please try again."
                    );
                }


                if (
                    existingParticipants &&
                    existingParticipants.length > 0
                ) {

                    throw new Error(
                        "This phone number is already registered."
                    );
                }


                // ------------------------------------
                // GENERATE REGISTRATION ID
                // ------------------------------------

                const registrationId =
                    await generateRegistrationId();


                // ------------------------------------
                // PARTICIPANT
                // ------------------------------------

                const participant = {

                    registration_id:
                        registrationId,

                    name:
                        name,

                    phone:
                        cleanPhone,

                    area:
                        area,

                    city:
                        city,

                    source:
                        registrationSource,

                    photo_url:
                        null
                };


                // ------------------------------------
                // INSERT
                // ------------------------------------

                console.log(
                    "Submitting participant..."
                );


                const {
                    error: insertError
                } =
                    await supabaseClient
                        .from("Participants")
                        .insert(
                            participant
                        );


                if (insertError) {

                    console.error(
                        "Supabase insert error:",
                        insertError
                    );


                    // Do not expose database details
                    // to the public user.

                    if (
                        insertError.code === "23505"
                    ) {

                        throw new Error(
                            "This registration already exists."
                        );
                    }


                    if (
                        insertError.code === "42501"
                    ) {

                        throw new Error(
                            "Registration is temporarily unavailable. Please try again."
                        );
                    }


                    throw new Error(
                        "Registration failed. Please try again."
                    );
                }


                // ------------------------------------
                // SUCCESS ID
                // ------------------------------------

                const successIdElement =
                    document.getElementById(
                        "successRegistrationId"
                    );


                if (
                    successIdElement
                ) {

                    successIdElement.innerText =
                        registrationId;
                }


                // ------------------------------------
                // RESET FORM
                // ------------------------------------

                registrationForm.reset();


                if (selectedFileName) {

                    selectedFileName.innerText =
                        "No file selected";
                }


                if (ocrStatus) {

                    ocrStatus.style.display =
                        "none";

                    ocrStatus.className =
                        "ocr-status";
                }


                // ------------------------------------
                // SHOW SUCCESS PAGE
                // ------------------------------------

                const registerPage =
                    document.getElementById(
                        "registerPage"
                    );

                const successPage =
                    document.getElementById(
                        "successPage"
                    );


                if (registerPage) {

                    registerPage.classList.remove(
                        "active-page"
                    );
                }


                if (successPage) {

                    successPage.classList.add(
                        "active-page"
                    );
                }


            } catch (error) {

                console.error(
                    "Registration error:",
                    error
                );


                showError(
                    error.message ||
                    "Registration failed. Please try again."
                );


            } finally {

                // --------------------------------
                // RESTORE BUTTON
                // --------------------------------

                if (submitButton) {

                    submitButton.disabled =
                        false;

                    submitButton.innerText =
                        submitButton.dataset.originalText ||
                        "Register Now";
                }
            }
        }
    );
}


// ============================================================
// REGISTER ANOTHER PERSON
// ============================================================

function registerAnother() {

    const successPage =
        document.getElementById(
            "successPage"
        );

    const registerPage =
        document.getElementById(
            "registerPage"
        );


    if (successPage) {

        successPage.classList.remove(
            "active-page"
        );
    }


    if (registerPage) {

        registerPage.classList.add(
            "active-page"
        );
    }
}