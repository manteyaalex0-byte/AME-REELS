/* =========================================================
   AME REELS
   SUPABASE APPLICATION
   COMPLETE APPLICATION CONTROLLER
   ========================================================= */


/* =========================================================
   SUPABASE
   ========================================================= */

const db = supabaseClient;


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentUser = null;
let currentProfile = null;
let selectedVip = null;


/* =========================================================
   VIP CONFIGURATION
   ========================================================= */

const VIP_LEVELS = [
    {
        level: 1,
        unlock: 9,
        daily: 1.20,
        task: "Content Review"
    },
    {
        level: 2,
        unlock: 27,
        daily: 2.60,
        task: "Data Checking"
    },
    {
        level: 3,
        unlock: 64,
        daily: 3.60,
        task: "Content Tagging"
    },
    {
        level: 4,
        unlock: 112,
        daily: 5.00,
        task: "Research Task"
    },
    {
        level: 5,
        unlock: 180,
        daily: 6.60,
        task: "Advanced Review"
    },
    {
        level: 6,
        unlock: 240,
        daily: 9.00,
        task: "Advanced Data Task"
    },
    {
        level: 7,
        unlock: 320,
        daily: 14.00,
        task: "Premium Task"
    }
];


const INVITATION_CODE = "AMEREELS";
const WITHDRAWAL_MINIMUM = 2;
const WITHDRAWAL_FEE_RATE = 0.20;
const REFERRAL_REWARD_RATE = 0.12;


/* =========================================================
   STARTUP
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    setupAuth();

    buildVipGrid();

    prepareReferralRegistration();

    checkExistingSession();

});


/* =========================================================
   AUTHENTICATION
   ========================================================= */

function setupAuth() {

    const loginForm =
        document.getElementById("loginForm");

    const registerForm =
        document.getElementById("registerForm");


    if (loginForm) {

        loginForm.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();

                await loginUser();

            }
        );

    }


    if (registerForm) {

        registerForm.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();

                await registerUser();

            }
        );

    }


    db.auth.onAuthStateChange(
        async function (event, session) {

            if (session && session.user) {

                currentUser = session.user;

                /*
                 * Small delay prevents Supabase auth
                 * callback from competing with sign-up.
                 */

                setTimeout(
                    async function () {

                        await loadProfile();

                    },
                    0
                );

            }

        }
    );

}


/* =========================================================
   AUTH TABS
   ========================================================= */

function showAuth(mode) {

    const loginForm =
        document.getElementById("loginForm");

    const registerForm =
        document.getElementById("registerForm");

    const tabs =
        document.querySelectorAll(".auth-tab");


    if (mode === "register") {

        if (loginForm) {
            loginForm.classList.add("hidden");
        }

        if (registerForm) {
            registerForm.classList.remove("hidden");
        }

        if (tabs.length >= 2) {

            tabs[0].classList.remove("active");
            tabs[1].classList.add("active");

        }

    } else {

        if (registerForm) {
            registerForm.classList.add("hidden");
        }

        if (loginForm) {
            loginForm.classList.remove("hidden");
        }

        if (tabs.length >= 2) {

            tabs[1].classList.remove("active");
            tabs[0].classList.add("active");

        }

    }


    clearAuthMessage();

}


/* =========================================================
   AUTH MESSAGE
   ========================================================= */

function showAuthMessage(message, isError = true) {

    const element =
        document.getElementById("authMessage");

    if (!element) {
        return;
    }

    element.textContent = message;

    element.style.display = "block";

    element.style.color =
        isError ? "#ff6b6b" : "#55efc4";

}


function clearAuthMessage() {

    const element =
        document.getElementById("authMessage");

    if (element) {

        element.textContent = "";

    }

}

/* =========================================================
   REGISTER
   ========================================================= */

async function registerUser() {

    const name =
        document
            .getElementById("registerName")
            .value
            .trim();

    const email =
        document
            .getElementById("registerEmail")
            .value
            .trim();

    const password =
        document
            .getElementById("registerPassword")
            .value;

    if (!name || !email || !password) {
        alert("Please fill in all fields.");
        return;
    }

    if (password.length < 6) {
        alert(
            "Password must be at least 6 characters."
        );
        return;
    }

    try {

        /* ================================
           FIND REFERRER FROM SHARED LINK
        ================================= */

        let referredBy = null;

        const referralCode =
            getReferralCodeFromUrl();

        if (referralCode) {

            const {
                data: referrerId,
                error: referrerError
            } = await db.rpc(
                "get_referrer_by_code",
                {
                    p_referral_code:
                        referralCode
                }
            );

            if (referrerError) {
                throw referrerError;
            }

            if (referrerId) {
                referredBy =
                    referrerId;
            }
        }

        /* ================================
           CREATE AUTH ACCOUNT
        ================================= */

        const {
            data,
            error
        } =
            await db.auth.signUp({
                email: email,
                password: password
            });

        if (error) {
            throw error;
        }

        if (!data.user) {
            throw new Error(
                "Account could not be created."
            );
        }

        /* ================================
           CREATE PERSONAL REFERRAL CODE
        ================================= */

        const referralCodeForUser =
            await generateUniqueReferralCode();

        /* ================================
           CREATE PROFILE
        ================================= */

        const {
            error: profileError
        } =
            await db
                .from("profiles")
                .upsert({
                    id: data.user.id,
                    full_name: name,
                    email: email,
                    role: "member",
                    vip_level: 0,
                    balance: 0,
                    earnings: 0,
                    referral_code:
                        referralCodeForUser,
                    referred_by:
                        referredBy
                });

        if (profileError) {
            throw profileError;
        }

        /* ================================
           CREATE REFERRAL RECORD
        ================================= */

        if (referredBy) {

            await createReferralRecord(
                referredBy,
                data.user.id
            );
        }

        alert(
            "Account created successfully."
        );

        /* ================================
           OPEN APPLICATION
        ================================= */

        if (data.session) {

            currentUser =
                data.user;

            await refreshCurrentProfile();

        } else {

            showAuth("login");

        }

    } catch (error) {

        console.error(
            "Registration error:",
            error
        );

        alert(
            error.message ||
            "Unable to create account."
        );
    }
}


/* =========================================================
   REFERRAL URL
   ========================================================= */

function prepareReferralRegistration() {

    const code =
        getReferralCodeFromUrl();


    if (!code) {
        return;
    }


    const input =
        document.getElementById(
            "registerInviteCode"
        );


    /*
     * The application uses AMEREELS as the
     * required invitation code.
     *
     * Referral codes are therefore handled
     * separately through the URL.
     */

if (input) {

    input.value = code;

    input.dataset.referralCode =
        code;

}

}


function getReferralCodeFromUrl() {

    try {

        const params =
            new URLSearchParams(
                window.location.search
            );

        return (
            params.get("ref") ||
            params.get("referral") ||
            ""
        ).trim();

    } catch (error) {

        return "";

    }

}


/* =========================================================
   UNIQUE REFERRAL CODE
   ========================================================= */

async function generateUniqueReferralCode() {

    for (let attempt = 0; attempt < 10; attempt++) {

        const randomNumber =
            Math.floor(
                100000 +
                Math.random() * 900000
            );

        const code =
            "AME" + randomNumber;


        const {
            data,
            error
        } =
            await db
                .from("profiles")
                .select("id")
                .eq(
                    "referral_code",
                    code
                )
                .maybeSingle();


        if (error) {

            console.warn(
                "Referral code check:",
                error
            );

            continue;

        }


        if (!data) {

            return code;

        }

    }


    return (
        "AME" +
        Date.now()
            .toString()
            .slice(-6)
    );

}


/* =========================================================
   CREATE REFERRAL RECORD
   ========================================================= */

async function createReferralRecord(
    referrerId,
    referredUserId
) {

    try {

        const {
            error
        } =
            await db
                .from("referrals")
                .insert({
                    referrer_id: referrerId,
                    referred_user_id: referredUserId,
                    reward: 0,
                    status: "pending"
                });


        if (error) {

            console.warn(
                "Referral record:",
                error
            );

        }

    } catch (error) {

        console.warn(
            "Referral record error:",
            error
        );

    }

}


/* =========================================================
   LOGIN
   ========================================================= */

async function loginUser() {

    clearAuthMessage();


    const email =
        document.getElementById(
            "loginEmail"
        )?.value.trim();


    const password =
        document.getElementById(
            "loginPassword"
        )?.value;


    if (!email || !password) {

        showAuthMessage(
            "Enter your email and password."
        );

        return;

    }


    try {

        showAuthMessage(
            "Logging in...",
            false
        );


        const {
            data,
            error
        } =
            await db.auth.signInWithPassword({
                email: email,
                password: password
            });


        if (error) {

            throw error;

        }


        currentUser = data.user;

        await loadProfile();

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        showAuthMessage(
            error.message ||
            "Login failed."
        );

    }

}


/* =========================================================
   CHECK EXISTING SESSION
   ========================================================= */

async function checkExistingSession() {

    try {

        const {
            data,
            error
        } =
            await db.auth.getSession();


        if (error) {

            console.error(
                "Session error:",
                error
            );

            return;

        }


        if (
            data &&
            data.session &&
            data.session.user
        ) {

            currentUser =
                data.session.user;

            await loadProfile();

        }

    } catch (error) {

        console.error(
            "Existing session error:",
            error
        );

    }

}


/* =========================================================
   LOAD PROFILE
   ========================================================= */

async function loadProfile() {

    if (!currentUser) {
        return;
    }


    try {

        let {
            data: profile,
            error
        } =
            await db
                .from("profiles")
                .select("*")
                .eq(
                    "id",
                    currentUser.id
                )
                .maybeSingle();


        if (error) {

            throw error;

        }


        /*
         * Create a profile if authentication exists
         * but the profile row does not.
         */

        if (!profile) {

            const referralCode =
                await generateUniqueReferralCode();


            const {
                data: newProfile,
                error: createError
            } =
                await db
                    .from("profiles")
                    .insert({
                        id: currentUser.id,
                        full_name:
                            currentUser.user_metadata
                                ?.full_name ||
                            "Member",
                        email:
                            currentUser.email ||
                            "",
                        username:
                            (
                                currentUser.email ||
                                "member"
                            )
                                .split("@")[0],
                        role: "member",
                        vip_level: 0,
                        balance: 0,
                        earnings: 0,
                        referral_code:
                            referralCode
                    })
                    .select("*")
                    .single();


            if (createError) {

                throw createError;

            }


            profile = newProfile;

        }


        currentProfile = profile;


        /*
         * Repair missing referral code if needed.
         */

        if (!currentProfile.referral_code) {

            const newCode =
                await generateUniqueReferralCode();


            const {
                data: updatedProfile
            } =
                await db
                    .from("profiles")
                    .update({
                        referral_code: newCode
                    })
                    .eq(
                        "id",
                        currentUser.id
                    )
                    .select("*")
                    .single();


            if (updatedProfile) {

                currentProfile =
                    updatedProfile;

            }

        }


        showApplication();

    } catch (error) {

        console.error(
            "Profile loading error:",
            error
        );

        showAuthMessage(
            error.message ||
            "Unable to load your account."
        );

    }

}


/* =========================================================
   SHOW APPLICATION
   ========================================================= */

function showApplication() {

    const authScreen =
        document.getElementById(
            "authScreen"
        );

    const appScreen =
        document.getElementById(
            "appScreen"
        );


    if (authScreen) {

        authScreen.classList.add(
            "hidden"
        );

    }


    if (appScreen) {

        appScreen.classList.remove(
            "hidden"
        );

    }


    updateUserInterface();

    buildVipGrid();

    updateVipTasks();

    loadAvailableTasks();

    loadMyTasks();

    loadNotifications();

    openPage("dashboardPage");

}


/* =========================================================
   UPDATE USER INTERFACE
   ========================================================= */

function updateUserInterface() {

    if (!currentProfile) {
        return;
    }


    const name =
        currentProfile.full_name ||
        "Member";


    const email =
        currentProfile.email ||
        currentUser?.email ||
        "";


    const balance =
        Number(
            currentProfile.balance || 0
        );


    const earnings =
        Number(
            currentProfile.earnings || 0
        );


    const vip =
        Number(
            currentProfile.vip_level || 0
        );


    const elements = {

        topUserName: name,

        welcomeName: name,

        profileName: name,

        profileEmail: email,

        dashboardBalance:
            money(balance),

        walletBalance:
            money(balance),

        vipPageBalance:
            money(balance),

        totalEarnings:
            money(earnings),

        earningTotal:
            money(earnings),

        dashboardVip:
            vip > 0
                ? "VIP " + vip
                : "None",

        vipPageCurrent:
            vip > 0
                ? "VIP " + vip
                : "None",

        profileVip:
            vip > 0
                ? "VIP " + vip
                : "None",

        referralCode:
            currentProfile.referral_code ||
            "—"

    };


    Object.keys(elements).forEach(
        function (id) {

            const element =
                document.getElementById(id);

            if (element) {

                element.textContent =
                    elements[id];

            }

        }
    );


    const contractText =
        document.getElementById(
            "contractText"
        );


    const currentVipTitle =
        document.getElementById(
            "currentVipTitle"
        );


    if (vip > 0) {

        const vipInfo =
            VIP_LEVELS.find(
                item =>
                    item.level === vip
            );


        if (vipInfo) {

            if (currentVipTitle) {

                currentVipTitle.textContent =
                    "VIP " +
                    vip +
                    " — " +
                    vipInfo.task;

            }


            if (contractText) {

                contractText.textContent =
                    "Your current VIP package is active. Complete the available task to receive the configured reward.";

            }

        }

    } else {

        if (currentVipTitle) {

            currentVipTitle.textContent =
                "No VIP Activated";

        }


        if (contractText) {

            contractText.textContent =
                "Activate a VIP package to start your contract.";

        }

    }


    updateReferralUI();

    updateAdminVisibility();

}


/* =========================================================
   ADMIN VISIBILITY
   ========================================================= */

function updateAdminVisibility() {

    const adminCard =
        document.getElementById(
            "adminAccessCard"
        );


    const isAdmin =
        currentProfile &&
        String(
            currentProfile.role || ""
        ).toLowerCase() === "admin";


    if (adminCard) {

        if (isAdmin) {

            adminCard.classList.remove(
                "hidden"
            );

        } else {

            adminCard.classList.add(
                "hidden"
            );

        }

    }

}


/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function openPage(pageId) {

    const pages =
        document.querySelectorAll(
            ".page"
        );


    pages.forEach(
        function (page) {

            page.classList.remove(
                "active-page"
            );

        }
    );


    const target =
        document.getElementById(pageId);


    if (!target) {
        return;
    }


    target.classList.add(
        "active-page"
    );


    /*
     * Refresh data whenever important pages open.
     */

    if (pageId === "dashboardPage") {

        refreshCurrentProfile();

        loadAvailableTasks();

        loadMyTasks();

    }


    if (pageId === "tasksPage") {

        loadAvailableTasks();

        loadMyTasks();

    }


    if (pageId === "myTasksPage") {

        loadMyTasks();

    }


    if (pageId === "walletPage") {

        refreshCurrentProfile();

    }


    if (pageId === "withdrawPage") {

        refreshCurrentProfile();

    }
        /* ================= EARNINGS ================= */

    if (pageId === "earningsPage") {

        refreshCurrentProfile();

        loadTransactionHistory();

    }

    if (pageId === "referralPage") {

        updateReferralUI();

        loadReferralHistory();

    }


    if (pageId === "adminPage") {

        loadAdminPanel();

    }


    if (pageId === "profilePage") {

        refreshCurrentProfile();

    }

}


/* =========================================================
   VIP GRID
   ========================================================= */

function buildVipGrid() {

    const grid =
        document.getElementById(
            "vipGrid"
        );


    if (!grid) {
        return;
    }


    grid.innerHTML = "";


    VIP_LEVELS.forEach(
        function (vip) {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "vip-card";


            card.innerHTML = `

                <div class="vip-card-header">

                    <span>
                        VIP ${vip.level}
                    </span>

                    <strong>
                        ${money(vip.daily)}
                    </strong>

                </div>

                <h3>
                    ${escapeHtml(vip.task)}
                </h3>

                <p>
                    Unlock: ${money(vip.unlock)}
                </p>

                <p>
                    Daily Task Reward:
                    ${money(vip.daily)}
                </p>

                <button
                    type="button"
                    class="main-btn"
                    onclick="openVipModal(${vip.level})"
                >
                    UNLOCK VIP ${vip.level}
                </button>

            `;


            grid.appendChild(card);

        }
    );

}


/* =========================================================
   VIP MODAL
   ========================================================= */

function openVipModal(level) {

    const vip =
        VIP_LEVELS.find(
            item =>
                item.level === Number(level)
        );


    if (!vip) {
        return;
    }


    selectedVip = vip;


    const modal =
        document.getElementById(
            "vipModal"
        );


    const title =
        document.getElementById(
            "modalVipTitle"
        );


    const unlock =
        document.getElementById(
            "modalUnlockAmount"
        );


    const daily =
        document.getElementById(
            "modalDailyAmount"
        );


    const balance =
        document.getElementById(
            "modalBalance"
        );


    const message =
        document.getElementById(
            "vipModalMessage"
        );


    if (title) {

        title.textContent =
            "VIP " +
            vip.level +
            " — " +
            vip.task;

    }


    if (unlock) {

        unlock.textContent =
            money(vip.unlock);

    }


    if (daily) {

        daily.textContent =
            money(vip.daily);

    }


    if (balance) {

        balance.textContent =
            money(
                currentProfile?.balance || 0
            );

    }


    if (message) {

        message.textContent = "";

    }


    if (modal) {

        modal.classList.remove(
            "hidden"
        );

    }

}


function closeVipModal() {

    const modal =
        document.getElementById(
            "vipModal"
        );


    if (modal) {

        modal.classList.add(
            "hidden"
        );

    }


    selectedVip = null;

}


/* =========================================================
   VIP ACTIVATION
   ========================================================= */

async function confirmVipUnlock() {

    if (!selectedVip) {

        return;

    }


    if (!currentUser || !currentProfile) {

        return;

    }


    const message =
        document.getElementById(
            "vipModalMessage"
        );


    const button =
        document.getElementById(
            "confirmVipButton"
        );


    const balance =
        Number(
            currentProfile.balance || 0
        );


    if (
        Number(
            currentProfile.vip_level || 0
        ) >= selectedVip.level
    ) {

        setMessage(
            message,
            "You already have this VIP level or a higher level.",
            true
        );

        return;

    }


    if (balance < selectedVip.unlock) {

        setMessage(
            message,
            "Insufficient account balance for this VIP activation.",
            true
        );

        return;

    }


    try {

        if (button) {

            button.disabled = true;

            button.textContent =
                "PROCESSING...";

        }


        /*
         * Keep the existing pending VIP activation
         * workflow used by the application.
         */

        const {
            data: existing,
            error: existingError
        } =
            await db
                .from("transactions")
                .select("id")
                .eq(
                    "user_id",
                    currentUser.id
                )
                .eq(
                    "type",
                    "vip_activation"
                )
                .eq(
                    "status",
                    "pending"
                )
                .limit(1);


        if (existingError) {

            throw existingError;

        }


        if (
            existing &&
            existing.length > 0
        ) {

            throw new Error(
                "You already have a pending VIP activation request."
            );

        }


        const {
            error
        } =
            await db
                .from("transactions")
                .insert({
                    user_id: currentUser.id,
                    type: "vip_activation",
                    amount: selectedVip.unlock,
                    status: "pending",
                    reference:
                        "VIP-" +
                        Date.now(),
                    description:
                        "VIP " +
                        selectedVip.level +
                        " activation request"
                });


        if (error) {

            throw error;

        }


        setMessage(
            message,
            "VIP activation request submitted successfully. Please wait for Admin approval.",
            false
        );


        await refreshCurrentProfile();

    } catch (error) {

        console.error(
            "VIP activation:",
            error
        );

        setMessage(
            message,
            error.message ||
            "VIP activation failed.",
            true
        );

    } finally {

        if (button) {

            button.disabled = false;

            button.textContent =
                "CONFIRM UNLOCK";

        }

    }

}


/* =========================================================
   VIP TASK DISPLAY
   ========================================================= */

function updateVipTasks() {

    const cards =
        document.querySelectorAll(
            "#taskList .vip-task"
        );


    const currentVip =
        Number(
            currentProfile?.vip_level || 0
        );


    cards.forEach(
        function (card) {

            const level =
                Number(
                    card.dataset.vip
                );


            const button =
                card.querySelector(
                    "button"
                );


            if (!button) {
                return;
            }


            if (level === currentVip) {

                button.disabled = false;

                button.textContent =
                    "ACCEPT";

                card.style.opacity = "1";

            } else {

                button.disabled = true;

                button.textContent =
                    level < currentVip
                        ? "AVAILABLE ABOVE"
                        : "VIP LOCKED";

                card.style.opacity =
                    "0.55";

            }

        }
    );


    updateAvailableTaskCount();

}


/* =========================================================
   LOAD AVAILABLE TASKS
   ========================================================= */

async function loadAvailableTasks() {

    if (!currentUser) {
        return;
    }


    try {

        const currentVip =
            Number(
                currentProfile?.vip_level || 0
            );


        if (!currentVip) {

            updateAvailableTaskCount();

            return;

        }


        /*
         * Correct schema:
         * tasks.status, NOT tasks.active.
         */

        const {
            data: tasks,
            error
        } =
            await db
                .from("tasks")
                .select("*")
                .eq(
                    "vip_level",
                    currentVip
                )
                .eq(
                    "status",
                    "active"
                )
                .eq(
                    "task_date",
                    new Date()
                        .toISOString()
                        .slice(0, 10)
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (error) {

            console.warn(
                "Available tasks:",
                error
            );

            updateAvailableTaskCount();

            return;

        }


        updateAvailableTaskCount(
            tasks?.length || 0
        );


        /*
         * Static task cards remain the visual interface.
         * Database tasks are used for secure task acceptance.
         */

        updateVipTasks();

    } catch (error) {

        console.error(
            "Task loading error:",
            error
        );

    }

}


/* =========================================================
   ACCEPT VIP TASK
   ========================================================= */

async function acceptVipTask(
    vipLevel,
    amount,
    title
) {

    if (!currentUser) {

        alert(
            "Please login first."
        );

        return;

    }


    const currentVip =
        Number(
            currentProfile?.vip_level || 0
        );


    if (
        currentVip !== Number(vipLevel)
    ) {

        alert(
            "This task is not available for your current VIP level."
        );

        return;

    }


    try {

        /*
         * Find today's active database task.
         */

        const today =
            new Date()
                .toISOString()
                .slice(0, 10);


        const {
            data: tasks,
            error
        } =
            await db
                .from("tasks")
                .select("*")
                .eq(
                    "vip_level",
                    Number(vipLevel)
                )
                .eq(
                    "status",
                    "active"
                )
                .eq(
                    "task_date",
                    today
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                )
                .limit(1);


        if (error) {

            throw error;

        }


        if (
            !tasks ||
            tasks.length === 0
        ) {

            alert(
                "No active task has been published for your VIP level today."
            );

            return;

        }


        const task =
            tasks[0];


        await acceptDatabaseTask(
            task.id
        );

    } catch (error) {

        console.error(
            "Accept VIP task:",
            error
        );

        alert(
            error.message ||
            "Unable to accept task."
        );

    }

}


/* =========================================================
   ACCEPT DATABASE TASK
   ========================================================= */

async function acceptDatabaseTask(
    taskId
) {

    if (!currentUser) {

        alert(
            "Please login first."
        );

        return;

    }


    if (!taskId) {

        alert(
            "Task ID is missing."
        );

        return;

    }


    try {

        /*
         * Secure server-side RPC.
         *
         * This replaces the old direct INSERT
         * into user_tasks.
         */

        const {
            data,
            error
        } =
            await db.rpc(
                "accept_task",
                {
                    p_task_id: taskId
                }
            );


        if (error) {

            throw error;

        }


        let userTaskId = null;


        if (data) {

            if (Array.isArray(data)) {

                userTaskId =
                    data[0]?.user_task_id ||
                    data[0]?.id ||
                    null;

            } else {

                userTaskId =
                    data.user_task_id ||
                    data.id ||
                    null;

            }

        }


        alert(
            "Task accepted successfully. Complete it to receive your reward."
        );


        await loadMyTasks();

        await refreshCurrentProfile();

        openPage("myTasksPage");


        /*
         * If the RPC returned the ID,
         * scroll to the task area.
         */

        if (userTaskId) {

            const element =
                document.getElementById(
                    "myTasksList"
                );

            if (element) {

                element.scrollIntoView({
                    behavior: "smooth"
                });

            }

        }

    } catch (error) {

        console.error(
            "Accept task error:",
            error
        );

        alert(
            error.message ||
            "Unable to accept this task."
        );

    }

}


/* =========================================================
   LOAD MY TASKS
   ========================================================= */

async function loadMyTasks() {

    const list =
        document.getElementById(
            "myTasksList"
        );


    if (!list || !currentUser) {
        return;
    }


    try {

        /*
         * Secure RPC returns task names and status.
         */

        const {
            data,
            error
        } =
            await db.rpc(
                "get_my_task_history"
            );


        if (error) {

            throw error;

        }


        const tasks =
            data || [];


        const sortedTasks =
            tasks.sort(
                function (a, b) {

                    return new Date(
                        b.accepted_at ||
                        b.created_at ||
                        0
                    ) -
                    new Date(
                        a.accepted_at ||
                        a.created_at ||
                        0
                    );

                }
            );


        list.innerHTML = "";


        if (sortedTasks.length === 0) {

            list.innerHTML = `
                <div class="empty-box">
                    No tasks accepted yet.
                </div>
            `;

            setText(
                "myTaskCount",
                "0"
            );

            return;

        }


        sortedTasks.forEach(
            function (item) {

                list.appendChild(
                    createMyTaskCard(item)
                );

            }
        );


        setText(
            "myTaskCount",
            String(
                sortedTasks.length
            )
        );

    } catch (error) {

        console.error(
            "My tasks error:",
            error
        );


        list.innerHTML = `
            <div class="empty-box">
                Unable to load your tasks.
            </div>
        `;

    }

}


/* =========================================================
   CREATE MY TASK CARD
   ========================================================= */

function createMyTaskCard(item) {

    const card =
        document.createElement(
            "div"
        );


    card.className =
        "task-card";


    const status =
        String(
            item.task_status ||
            item.status ||
            "accepted"
        ).toLowerCase();


    let statusLabel =
        status.toUpperCase();


    let actionHtml = "";


    if (
        status === "accepted" ||
        status === "pending"
    ) {

        actionHtml = `
            <button
                type="button"
                class="main-btn"
                onclick="completeMyTask('${escapeAttribute(item.user_task_id)}')"
            >
                COMPLETE TASK
            </button>
        `;

    } else if (
        status === "completed"
    ) {

        statusLabel =
            "COMPLETED";

        actionHtml = `
            <span>
                ✓ Reward Credited
            </span>
        `;

    } else if (
        status === "rejected"
    ) {

        actionHtml = `
            <span>
                Rejected
            </span>
        `;

    }


    card.innerHTML = `

        <div>

            <span class="small-label">
                ${escapeHtml(
                    formatDate(
                        item.task_date
                    )
                )}
            </span>

            <h3>
                ${escapeHtml(
                    item.title ||
                    "Daily Task"
                )}
            </h3>

            <p>
                ${escapeHtml(
                    item.description ||
                    "Complete this task to receive the configured reward."
                )}
            </p>

            <small>
                Status:
                <strong>
                    ${escapeHtml(statusLabel)}
                </strong>
            </small>

        </div>


        <div class="task-right">

            <strong>
                ${money(
                    Number(
                        item.reward || 0
                    )
                )}
            </strong>

            ${actionHtml}

        </div>

    `;


    return card;

}


/* =========================================================
   COMPLETE TASK
   ========================================================= */
 async function completeMyTask(userTaskId) {

    if (!currentUser) {
        alert("Please login first.");
        return;
    }

    if (!userTaskId) {
        alert("Task information is missing.");
        return;
    }

    const confirmed = window.confirm(
        "Complete this task and receive the configured reward?"
    );

    if (!confirmed) {
        return;
    }

    try {

        const {
            data,
            error
        } = await db.rpc(
            "complete_task",
            {
                p_user_task_id: userTaskId
            }
        );

        if (error) {
            throw error;
        }

        /*
         * The RPC returns success:false when
         * the server rejects the completion.
         */
        let result = data;

        if (Array.isArray(data)) {
            result = data[0] || {};
        }

        if (
            result &&
            result.success === false
        ) {

            throw new Error(
                result.error_message ||
                result.message ||
                "Task could not be completed."
            );
        }

        const reward =
            result?.reward ??
            result?.amount ??
            null;

        if (reward !== null) {

            alert(
                "Task completed successfully. Reward credited: " +
                money(Number(reward))
            );

        } else {

            alert(
                "Task completed successfully. Your reward has been credited."
            );

        }

        await refreshCurrentProfile();

        await loadMyTasks();

        await loadAvailableTasks();

        openPage("myTasksPage");

    } catch (error) {

        console.error(
            "Complete task error:",
            error
        );

        alert(
            error.message ||
            "Unable to complete task."
        );

    }

}


/* =========================================================
   UPDATE AVAILABLE TASK COUNT
   ========================================================= */

function updateAvailableTaskCount(
    databaseCount = null
) {

    const element =
        document.getElementById(
            "availableTaskCount"
        );


    if (!element) {
        return;
    }


    if (databaseCount !== null) {

        element.textContent =
            String(databaseCount);

        return;

    }


    const vip =
        Number(
            currentProfile?.vip_level || 0
        );


    element.textContent =
        vip > 0
            ? "1"
            : "0";

}


/* =========================================================
   REFRESH CURRENT PROFILE
   ========================================================= */

async function refreshCurrentProfile() {

    if (!currentUser) {
        return;
    }


    try {

        const {
            data,
            error
        } =
            await db
                .from("profiles")
                .select("*")
                .eq(
                    "id",
                    currentUser.id
                )
                .single();


        if (error) {

            throw error;

        }


        currentProfile = data;

        updateUserInterface();

        updateVipTasks();

    } catch (error) {

        console.error(
            "Profile refresh:",
            error
        );

    }

}


/* =========================================================
   REFERRAL UI
   ========================================================= */

function updateReferralUI() {

    if (!currentProfile) {
        return;
    }


    const code =
        currentProfile.referral_code ||
        "";


    setText(
        "referralCode",
        code || "—"
    );


    const link =
        document.getElementById(
            "referralLink"
        );


    if (link && code) {

        const url =
            window.location.origin +
            window.location.pathname +
            "?ref=" +
            encodeURIComponent(code);


        link.value = url;

    }

}


/* =========================================================
   COPY REFERRAL CODE
   ========================================================= */

async function copyReferralCode() {

    const code =
        currentProfile?.referral_code;


    if (!code) {

        alert(
            "Referral code is not available."
        );

        return;

    }


    await copyText(code);


    alert(
        "Referral code copied."
    );

}


/* =========================================================
   COPY REFERRAL LINK
   ========================================================= */

async function copyReferralLink() {

    const input =
        document.getElementById(
            "referralLink"
        );


    if (!input || !input.value) {

        alert(
            "Referral link is not available."
        );

        return;

    }


    await copyText(
        input.value
    );


    alert(
        "Referral link copied."
    );

}


/* =========================================================
   SHARE REFERRAL
   ========================================================= */

async function shareReferral() {

    const code =
        currentProfile?.referral_code;


    if (!code) {

        alert(
            "Referral information is not available."
        );

        return;

    }


    const link =
        window.location.origin +
        window.location.pathname +
        "?ref=" +
        encodeURIComponent(code);


    const message =
        "Join AME REELS using my referral link:\n\n" +
        link;


    try {

        if (
            navigator.share
        ) {

            await navigator.share({
                title: "AME REELS",
                text: message,
                url: link
            });

        } else {

            await copyText(
                link
            );

            alert(
                "Referral link copied. You can now share it."
            );

        }

    } catch (error) {

        console.log(
            "Share cancelled:",
            error
        );

    }

}


/* =========================================================
   REFERRAL HISTORY
   ========================================================= */

async function loadReferralHistory() {

    if (!currentUser) {
        return;
    }


    try {

        const {
            data,
            error
        } =
            await db
                .from("referrals")
                .select("*")
                .or(
                    "referrer_id.eq." +
                    currentUser.id +
                    ",referred_user_id.eq." +
                    currentUser.id
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (error) {

            console.warn(
                "Referral history:",
                error
            );

            return;

        }


        /*
         * The existing HTML does not contain
         * a dedicated referral history element.
         *
         * Data remains available in Supabase.
         */

        console.log(
            "Referral history:",
            data || []
        );

    } catch (error) {

        console.warn(
            "Referral history error:",
            error
        );

    }

}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

async function loadNotifications() {

    if (!currentUser) {
        return;
    }


    try {

        const {
            data,
            error
        } =
            await db
                .from("notifications")
                .select("*")
                .eq(
                    "user_id",
                    currentUser.id
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                )
                .limit(20);


        if (error) {

            console.warn(
                "Notifications:",
                error
            );

            return;

        }


        console.log(
            "AME REELS notifications:",
            data || []
        );


        /*
         * No notification panel currently exists
         * in index.html, so notifications are kept
         * ready for the UI.
         */

    } catch (error) {

        console.warn(
            "Notification loading:",
            error
        );

    }

}

/* =========================================================
   RECHARGE DEPOSIT ADDRESSES
   ========================================================= */

const RECHARGE_ADDRESSES = {

    "USDT — TRC20":
        "TDivZhsq2g2is5GGouYE2iXfkJRwZLBxkY",

    "USDT — ERC20":
        "0xaea9be302fd28d897cdf1cad3d78326c65126c72",

    "USDT — BEP-20":
        "0xaea9be302fd28d897cdf1cad3d78326c65126c72",

    "USDC — ERC20":
        "0xaea9be302fd28d897cdf1cad3d78326c65126c72",

    "USDC — Polygon":
        "0xaea9be302fd28d897cdf1cad3d78326c65126c72"

};


/* =========================================================
   UPDATE RECHARGE ADDRESS
   ========================================================= */

function updateRechargeAddress() {

    const network =
        document.getElementById(
            "rechargeNetwork"
        )?.value;


    const addressInput =
        document.getElementById(
            "rechargeAddress"
        );


    if (!network || !addressInput) {
        return;
    }


    const address =
        RECHARGE_ADDRESSES[network] || "";


    addressInput.value =
        address;

}


/* =========================================================
   COPY RECHARGE ADDRESS
   ========================================================= */

async function copyRechargeAddress() {

    const address =
        document.getElementById(
            "rechargeAddress"
        )?.value;


    if (!address) {

        alert(
            "Deposit address is not available."
        );

        return;

    }


    const copied =
        await copyText(address);


    if (copied) {

        alert(
            "Deposit address copied successfully."
        );

    } else {

        alert(
            "Unable to copy the address."
        );

    }

}
/* =========================================================
   RECHARGE
   ========================================================= */

async function requestRecharge() {

    if (!currentUser) {

        alert(
            "Please login before requesting a recharge."
        );

        return;

    }


    const amount =
        Number(
            document.getElementById(
                "rechargeAmount"
            )?.value
        );


    const network =
        document.getElementById(
            "rechargeNetwork"
        )?.value;


    const address =
        document.getElementById(
            "rechargeAddress"
        )?.value;


    const message =
        document.getElementById(
            "rechargeMessage"
        );


    if (!amount || amount <= 0) {

        setMessage(
            message,
            "Enter a valid recharge amount.",
            true
        );

        return;

    }


    if (!network) {

        setMessage(
            message,
            "Please select a recharge network.",
            true
        );

        return;

    }


    if (!address) {

        setMessage(
            message,
            "Recharge deposit address is not available.",
            true
        );

        return;

    }


    try {

        setMessage(
            message,
            "Submitting recharge request...",
            false
        );


        const reference =
            "RECHARGE-" +
            Date.now();


        const {
            error
        } =
            await db
                .from("transactions")
                .insert({
                    user_id:
                        currentUser.id,

                    type:
                        "recharge",

                    amount:
                        amount,

                    status:
                        "pending",

                    reference:
                        reference,

                    description:
                        "Recharge request via " +
                        network +
                        " | Deposit Address: " +
                        address
                });


        if (error) {

            throw error;

        }


        setMessage(
            message,
            "Recharge request submitted successfully. Please wait for Admin approval.",
            false
        );


        const amountInput =
            document.getElementById(
                "rechargeAmount"
            );


        if (amountInput) {

            amountInput.value = "";

        }

    } catch (error) {

        console.error(
            "Recharge error:",
            error
        );


        setMessage(
            message,
            error.message ||
            "Recharge request failed.",
            true
        );

    }

}
/* =========================================================
   WITHDRAWAL CALCULATOR
   ========================================================= */

function calculateWithdrawal() {

    const amount =
        Number(
            document.getElementById(
                "withdrawAmount"
            )?.value
        ) || 0;


    const fee =
        amount *
        WITHDRAWAL_FEE_RATE;


    const net =
        amount -
        fee;


    setText(
        "grossAmount",
        money(amount)
    );


    setText(
        "withdrawFee",
        money(fee)
    );


    setText(
        "netAmount",
        money(
            Math.max(net, 0)
        )
    );

}


/* =========================================================
   WITHDRAWAL
   ========================================================= */

async function requestWithdrawal() {

    const amount =
        Number(
            document.getElementById(
                "withdrawAmount"
            )?.value
        );


    const network =
        document.getElementById(
            "withdrawNetwork"
        )?.value;


    const wallet =
        document.getElementById(
            "withdrawWallet"
        )?.value.trim();


    const message =
        document.getElementById(
            "withdrawMessage"
        );


    if (!amount || amount < WITHDRAWAL_MINIMUM) {

        setMessage(
            message,
            "Minimum withdrawal is $2.00.",
            true
        );

        return;

    }


    if (!network) {

        setMessage(
            message,
            "Select a network.",
            true
        );

        return;

    }


    if (!wallet) {

        setMessage(
            message,
            "Enter your receiving wallet address.",
            true
        );

        return;

    }


    try {

        setMessage(
            message,
            "Submitting withdrawal request...",
            false
        );


        /*
         * Secure server-side withdrawal RPC.
         *
         * The server calculates the real fee,
         * checks balance and deducts funds.
         */

        const {
            data,
            error
        } =
            await db.rpc(
                "request_withdrawal",
                {
                    p_amount: amount,
                    p_network: network,
                    p_wallet_address: wallet
                }
            );


        if (error) {

            throw error;

        }


        let result = data;


        if (Array.isArray(data)) {

            result =
                data[0] || {};

        }


        setMessage(
            message,
            "Withdrawal request submitted successfully. Net amount: " +
            money(
                Number(
                    result?.net_amount ||
                    amount *
                    (1 - WITHDRAWAL_FEE_RATE)
                )
            ),
            false
        );


        const amountInput =
            document.getElementById(
                "withdrawAmount"
            );


        const walletInput =
            document.getElementById(
                "withdrawWallet"
            );


        if (amountInput) {

            amountInput.value = "";

        }


        if (walletInput) {

            walletInput.value = "";

        }


        calculateWithdrawal();


        await refreshCurrentProfile();

    } catch (error) {

        console.error(
            "Withdrawal error:",
            error
        );

        setMessage(
            message,
            error.message ||
            "Withdrawal request failed.",
            true
        );

    }

}


/* =========================================================
   ADMIN CHECK
   ========================================================= */

function isCurrentUserAdmin() {

    return (
        currentProfile &&
        String(
            currentProfile.role || ""
        ).toLowerCase() === "admin"
    );

}


/* =========================================================
   OPEN ADMIN PANEL
   ========================================================= */

function openAdminPanel() {

    if (!isCurrentUserAdmin()) {

        alert(
            "Admin access required."
        );

        return;

    }


    openPage(
        "adminPage"
    );

}


/* =========================================================
   ADMIN PANEL
   ========================================================= */

async function loadAdminPanel() {

    if (!isCurrentUserAdmin()) {

        return;

    }


    await Promise.allSettled([
        loadAdminSummary(),
        loadAdminRechargeRequests(),
        loadAdminVipRequests(),
        loadAdminWithdrawalRequests(),
        loadAdminUsers()
    ]);

}


/* =========================================================
   ADMIN SUMMARY
   ========================================================= */

async function loadAdminSummary() {

    if (!isCurrentUserAdmin()) {
        return;
    }


    try {

        const [
            usersResult,
            rechargeResult,
            vipResult,
            withdrawalResult
        ] =
            await Promise.all([

                db
                    .from("profiles")
                    .select(
                        "id",
                        {
                            count: "exact",
                            head: true
                        }
                    ),

                db
                    .from("transactions")
                    .select(
                        "id",
                        {
                            count: "exact",
                            head: true
                        }
                    )
                    .eq(
                        "type",
                        "recharge"
                    )
                    .eq(
                        "status",
                        "pending"
                    ),

                db
                    .from("transactions")
                    .select(
                        "id",
                        {
                            count: "exact",
                            head: true
                        }
                    )
                    .eq(
                        "type",
                        "vip_activation"
                    )
                    .eq(
                        "status",
                        "pending"
                    ),

                db
                    .from("withdrawals")
                    .select(
                        "id",
                        {
                            count: "exact",
                            head: true
                        }
                    )
                    .eq(
                        "status",
                        "pending"
                    )

            ]);


        setText(
            "adminUserCount",
            String(
                usersResult.count || 0
            )
        );


        setText(
            "adminRechargeCount",
            String(
                rechargeResult.count || 0
            )
        );


        setText(
            "adminVipCount",
            String(
                vipResult.count || 0
            )
        );


        setText(
            "adminWithdrawalCount",
            String(
                withdrawalResult.count || 0
            )
        );

    } catch (error) {

        console.error(
            "Admin summary:",
            error
        );

    }

}


/* =========================================================
   ADMIN RECHARGE REQUESTS
   ========================================================= */

async function loadAdminRechargeRequests() {

    const list =
        document.getElementById(
            "adminRechargeList"
        );


    if (!list || !isCurrentUserAdmin()) {
        return;
    }


    try {

        const {
            data,
            error
        } =
            await db
                .from("transactions")
                .select("*")
                .eq(
                    "type",
                    "recharge"
                )
                .eq(
                    "status",
                    "pending"
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (error) {

            throw error;

        }


        list.innerHTML = "";


        if (!data || data.length === 0) {

            list.innerHTML = `
                <div class="empty-box">
                    No pending recharge requests.
                </div>
            `;

            return;

        }


        data.forEach(
            function (item) {

                const card =
                    document.createElement(
                        "div"
                    );

                card.className =
                    "task-card";


                card.innerHTML = `

                    <div>

                        <span class="small-label">
                            RECHARGE REQUEST
                        </span>

                        <h3>
                            ${money(
                                Number(
                                    item.amount || 0
                                )
                            )}
                        </h3>

                        <p>
                            ${escapeHtml(
                                item.description ||
                                "Recharge request"
                            )}
                        </p>

                        <small>
                            ${escapeHtml(
                                formatDate(
                                    item.created_at
                                )
                            )}
                        </small>

                    </div>

                    <div class="task-right">

                        <button
                            type="button"
                            class="main-btn"
                            onclick="approveRecharge('${escapeAttribute(item.id)}')"
                        >
                            APPROVE
                        </button>

                        <button
                            type="button"
                            class="main-btn"
                            onclick="rejectRecharge('${escapeAttribute(item.id)}')"
                        >
                            REJECT
                        </button>

                    </div>

                `;


                list.appendChild(card);

            }
        );

    } catch (error) {

        console.error(
            "Admin recharge requests:",
            error
        );


        list.innerHTML = `
            <div class="empty-box">
                Unable to load recharge requests.
            </div>
        `;

    }

}


/* =========================================================
   ADMIN VIP REQUESTS
   ========================================================= */

async function loadAdminVipRequests() {

    const list =
        document.getElementById(
            "adminVipList"
        );


    if (!list || !isCurrentUserAdmin()) {
        return;
    }


    try {

        const {
            data,
            error
        } =
            await db
                .from("transactions")
                .select("*")
                .eq(
                    "type",
                    "vip_activation"
                )
                .eq(
                    "status",
                    "pending"
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (error) {

            throw error;

        }


        list.innerHTML = "";


        if (!data || data.length === 0) {

            list.innerHTML = `
                <div class="empty-box">
                    No pending VIP activation requests.
                </div>
            `;

            return;

        }


        data.forEach(
            function (item) {

                const card =
                    document.createElement(
                        "div"
                    );

                card.className =
                    "task-card";


                card.innerHTML = `

                    <div>

                        <span class="small-label">
                            VIP ACTIVATION
                        </span>

                        <h3>
                            ${money(
                                Number(
                                    item.amount || 0
                                )
                            )}
                        </h3>

                        <p>
                            ${escapeHtml(
                                item.description ||
                                "VIP activation request"
                            )}
                        </p>

                        <small>
                            ${escapeHtml(
                                formatDate(
                                    item.created_at
                                )
                            )}
                        </small>

                    </div>

                    <div class="task-right">

                        <button
                            type="button"
                            class="main-btn"
                            onclick="approveVip('${escapeAttribute(item.id)}')"
                        >
                            APPROVE
                        </button>

                        <button
                            type="button"
                            class="main-btn"
                            onclick="rejectVip('${escapeAttribute(item.id)}')"
                        >
                            REJECT
                        </button>

                    </div>

                `;


                list.appendChild(card);

            }
        );

    } catch (error) {

        console.error(
            "Admin VIP requests:",
            error
        );


        list.innerHTML = `
            <div class="empty-box">
                Unable to load VIP requests.
            </div>
        `;

    }

}


/* =========================================================
   ADMIN WITHDRAWAL REQUESTS
   ========================================================= */

async function loadAdminWithdrawalRequests() {

    const list =
        document.getElementById(
            "adminWithdrawalList"
        );


    if (!list || !isCurrentUserAdmin()) {
        return;
    }


    try {

        const {
            data,
            error
        } =
            await db
                .from("withdrawals")
                .select("*")
                .eq(
                    "status",
                    "pending"
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (error) {

            throw error;

        }


        list.innerHTML = "";


        if (!data || data.length === 0) {

            list.innerHTML = `
                <div class="empty-box">
                    No pending withdrawal requests.
                </div>
            `;

            return;

        }


        data.forEach(
            function (item) {

                const card =
                    document.createElement(
                        "div"
                    );

                card.className =
                    "task-card";


                card.innerHTML = `

                    <div>

                        <span class="small-label">
                            WITHDRAWAL
                        </span>

                        <h3>
                            ${money(
                                Number(
                                    item.amount || 0
                                )
                            )}
                        </h3>

                        <p>
                            Network:
                            ${escapeHtml(
                                item.network ||
                                "—"
                            )}
                        </p>

                        <p>
                            Wallet:
                            ${escapeHtml(
                                item.wallet_address ||
                                "—"
                            )}
                        </p>

                        <small>
                            Net:
                            ${money(
                                Number(
                                    item.net_amount || 0
                                )
                            )}
                            <br>
                            ${escapeHtml(
                                formatDate(
                                    item.created_at
                                )
                            )}
                        </small>

                    </div>

                    <div class="task-right">

                        <button
                            type="button"
                            class="main-btn"
                            onclick="approveWithdrawal('${escapeAttribute(item.id)}')"
                        >
                            APPROVE
                        </button>

                        <button
                            type="button"
                            class="main-btn"
                            onclick="rejectWithdrawal('${escapeAttribute(item.id)}')"
                        >
                            REJECT
                        </button>

                    </div>

                `;


                list.appendChild(card);

            }
        );

    } catch (error) {

        console.error(
            "Admin withdrawals:",
            error
        );


        list.innerHTML = `
            <div class="empty-box">
                Unable to load withdrawal requests.
            </div>
        `;

    }

}


/* =========================================================
   ADMIN USERS
   ========================================================= */

async function loadAdminUsers() {

    const list =
        document.getElementById(
            "adminUsersList"
        );


    if (!list || !isCurrentUserAdmin()) {
        return;
    }


    try {

        const {
            data,
            error
        } =
            await db
                .from("profiles")
                .select(
                    "id,full_name,email,username,role,vip_level,balance,earnings,created_at"
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (error) {

            throw error;

        }


        list.innerHTML = "";


        if (!data || data.length === 0) {

            list.innerHTML = `
                <div class="empty-box">
                    No users found.
                </div>
            `;

            return;

        }


        data.forEach(
            function (user) {

                const card =
                    document.createElement(
                        "div"
                    );

                card.className =
                    "task-card";


                card.innerHTML = `

                    <div>

                        <span class="small-label">
                            ${escapeHtml(
                                String(
                                    user.role ||
                                    "member"
                                ).toUpperCase()
                            )}
                        </span>

                        <h3>
                            ${escapeHtml(
                                user.full_name ||
                                "Member"
                            )}
                        </h3>

                        <p>
                            ${escapeHtml(
                                user.email ||
                                ""
                            )}
                        </p>

                        <small>
                            VIP:
                            ${Number(
                                user.vip_level || 0
                            )}

                            <br>

                            Balance:
                            ${money(
                                Number(
                                    user.balance || 0
                                )
                            )}

                            <br>

                            Earnings:
                            ${money(
                                Number(
                                    user.earnings || 0
                                )
                            )}
                        </small>

                    </div>

                `;


                list.appendChild(card);

            }
        );

    } catch (error) {

        console.error(
            "Admin users:",
            error
        );


        list.innerHTML = `
            <div class="empty-box">
                Unable to load users.
            </div>
        `;

    }

}


/* =========================================================
   ADMIN APPROVE RECHARGE
   ========================================================= */

async function approveRecharge(
    transactionId
) {

    if (!isCurrentUserAdmin()) {

        alert(
            "Admin access required."
        );

        return;

    }


    try {

        const {
            data,
            error
        } =
            await db.rpc(
                "admin_approve_recharge",
                {
                    p_transaction_id:
                        transactionId
                }
            );


        if (error) {

            throw error;

        }


        alert(
            "Recharge approved successfully."
        );


        await loadAdminPanel();

    } catch (error) {

        console.error(
            "Approve recharge:",
            error
        );

        alert(
            error.message ||
            "Unable to approve recharge."
        );

    }

}


/* =========================================================
   ADMIN REJECT RECHARGE
   ========================================================= */

async function rejectRecharge(
    transactionId
) {

    if (!isCurrentUserAdmin()) {

        alert(
            "Admin access required."
        );

        return;

    }


    try {

        const {
            error
        } =
            await db.rpc(
                "admin_reject_recharge",
                {
                    p_transaction_id:
                        transactionId
                }
            );


        if (error) {

            throw error;

        }


        alert(
            "Recharge rejected."
        );


        await loadAdminPanel();

    } catch (error) {

        console.error(
            "Reject recharge:",
            error
        );

        alert(
            error.message ||
            "Unable to reject recharge."
        );

    }

}


/* =========================================================
   ADMIN APPROVE VIP
   ========================================================= */

async function approveVip(
    transactionId
) {

    if (!isCurrentUserAdmin()) {

        alert(
            "Admin access required."
        );

        return;

    }


    try {

        /* ================================
           GET VIP TRANSACTION DETAILS
        ================================= */

        const {
            data: transaction,
            error: transactionError
        } =
            await db
                .from("transactions")
                .select(
                    "id,user_id,amount,description"
                )
                .eq(
                    "id",
                    transactionId
                )
                .single();


        if (transactionError) {

            throw transactionError;

        }


        /* ================================
           DETERMINE VIP LEVEL
        ================================= */

        const description =
            String(
                transaction.description || ""
            );


        const match =
            description.match(
                /VIP\s+(\d+)/i
            );


        let vipLevel =
            match
                ? Number(match[1])
                : null;


        /* Fallback: match unlock amount */

        if (!vipLevel) {

            const vip =
                VIP_LEVELS.find(
                    level =>
                        Number(level.unlock) ===
                        Number(transaction.amount)
                );


            if (vip) {

                vipLevel =
                    Number(vip.level);

            }

        }


        if (!vipLevel) {

            throw new Error(
                "Unable to determine VIP level for this activation."
            );

        }


        /* ================================
           APPROVE VIP ACTIVATION
        ================================= */

        const {
            error
        } =
            await db.rpc(
                "admin_approve_vip",
                {
                    p_transaction_id:
                        transactionId
                }
            );


        if (error) {

            throw error;

        }


        /* ================================
           PROCESS REFERRAL REWARD
           12% GOES TO THE REFERRER
        ================================= */

        let referralProcessed =
            false;


        try {

            const {
                error:
                    referralError
            } =
                await db.rpc(
                    "process_referral_reward",
                    {
                        p_referred_user_id:
                            transaction.user_id,

                        p_vip_level:
                            vipLevel
                    }
                );


            if (referralError) {

                console.error(
                    "Referral reward:",
                    referralError
                );

            } else {

                referralProcessed =
                    true;

            }

        } catch (referralError) {

            console.error(
                "Referral reward error:",
                referralError
            );

        }


        /* ================================
           SUCCESS MESSAGE
        ================================= */

        if (referralProcessed) {

            alert(
                "VIP activation approved successfully.\n\n" +
                "Referral reward processed successfully."
            );

        } else {

            alert(
                "VIP activation approved successfully."
            );

        }


        await loadAdminPanel();


    } catch (error) {

        console.error(
            "Approve VIP:",
            error
        );


        alert(
            error.message ||
            "Unable to approve VIP."
        );

    }

}
/* =========================================================
   ADMIN REJECT VIP
   ========================================================= */

async function rejectVip(
    transactionId
) {

    if (!isCurrentUserAdmin()) {

        alert(
            "Admin access required."
        );

        return;

    }


    try {

        const {
            error
        } =
            await db.rpc(
                "admin_reject_vip",
                {
                    p_transaction_id:
                        transactionId
                }
            );


        if (error) {

            throw error;

        }


        alert(
            "VIP activation rejected."
        );


        await loadAdminPanel();

    } catch (error) {

        console.error(
            "Reject VIP:",
            error
        );

        alert(
            error.message ||
            "Unable to reject VIP."
        );

    }

}


/* =========================================================
   ADMIN APPROVE WITHDRAWAL
   ========================================================= */

async function approveWithdrawal(
    withdrawalId
) {

    if (!isCurrentUserAdmin()) {

        alert(
            "Admin access required."
        );

        return;

    }


    try {

        /*
         * Correct RPC created in Step 8:
         *
         * admin_process_withdrawal(
         *     p_withdrawal_id,
         *     p_action
         * )
         */

        const {
            data,
            error
        } =
            await db.rpc(
                "admin_process_withdrawal",
                {
                    p_withdrawal_id:
                        withdrawalId,
                    p_action:
                        "approved"
                }
            );


        if (error) {

            throw error;

        }


        alert(
            "Withdrawal approved successfully."
        );


        await loadAdminPanel();

    } catch (error) {

        console.error(
            "Approve withdrawal:",
            error
        );

        alert(
            error.message ||
            "Unable to approve withdrawal."
        );

    }

}


/* =========================================================
   ADMIN REJECT WITHDRAWAL
   ========================================================= */

async function rejectWithdrawal(
    withdrawalId
) {

    if (!isCurrentUserAdmin()) {

        alert(
            "Admin access required."
        );

        return;

    }


    const confirmed =
        window.confirm(
            "Reject this withdrawal? The deducted amount will be refunded to the member's balance."
        );


    if (!confirmed) {

        return;

    }


    try {

        const {
            data,
            error
        } =
            await db.rpc(
                "admin_process_withdrawal",
                {
                    p_withdrawal_id:
                        withdrawalId,
                    p_action:
                        "rejected"
                }
            );


        if (error) {

            throw error;

        }


        alert(
            "Withdrawal rejected and the amount has been refunded."
        );


        await loadAdminPanel();

    } catch (error) {

        console.error(
            "Reject withdrawal:",
            error
        );

        alert(
            error.message ||
            "Unable to reject withdrawal."
        );

    }

}

function contactAdminWhatsApp() {

    const whatsappNumber =
        "254111840669";

    const whatsapp =
        "https://wa.me/" + whatsappNumber;

    window.open(
        whatsapp,
        "_blank",
        "noopener,noreferrer"
    );
}


function joinWhatsAppGroup() {

    const groupLink =
        "https://chat.whatsapp.com/FCS4uDnwTlzBNoH6N4wtTt?s=cl&p=a&ilr=4&iam=0";

    window.open(
        groupLink,
        "_blank",
        "noopener,noreferrer"
    );
}


window.contactAdminWhatsApp =
    contactAdminWhatsApp;

window.joinWhatsAppGroup =
    joinWhatsAppGroup;


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

    try {

        await db.auth.signOut();

    } catch (error) {

        console.error(
            "Logout:",
            error
        );

    }


    currentUser = null;

    currentProfile = null;

    selectedVip = null;


    const appScreen =
        document.getElementById(
            "appScreen"
        );


    const authScreen =
        document.getElementById(
            "authScreen"
        );


    if (appScreen) {

        appScreen.classList.add(
            "hidden"
        );

    }


    if (authScreen) {

        authScreen.classList.remove(
            "hidden"
        );

    }


    showAuth("login");

}


/* =========================================================
   UTILITY — MONEY
   ========================================================= */

function money(value) {

    const number =
        Number(value) || 0;


    return (
        "$" +
        number.toFixed(2)
    );

}


function formatMoney(value) {

    return money(value);

}


/* =========================================================
   UTILITY — DATE
   ========================================================= */

function formatDate(value) {

    if (!value) {

        return "—";

    }


    try {

        const date =
            new Date(value);


        if (Number.isNaN(
            date.getTime()
        )) {

            return String(value);

        }


        return date.toLocaleString();

    } catch (error) {

        return String(value);

    }

}


/* =========================================================
   UTILITY — SET TEXT
   ========================================================= */

function setText(
    id,
    value
) {

    const element =
        document.getElementById(id);


    if (element) {

        element.textContent =
            value;

    }

}


/* =========================================================
   UTILITY — MESSAGE
   ========================================================= */

function setMessage(
    element,
    message,
    isError = false
) {

    if (!element) {
        return;
    }


    element.textContent =
        message;


    element.style.display =
        "block";


    element.style.color =
        isError
            ? "#ff6b6b"
            : "#55efc4";

}


/* =========================================================
   UTILITY — ESCAPE HTML
   ========================================================= */

function escapeHtml(value) {

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


/* =========================================================
   UTILITY — ESCAPE ATTRIBUTE
   ========================================================= */

function escapeAttribute(value) {

    return String(
        value ?? ""
    )
        .replace(
            /\\/g,
            "\\\\"
        )
        .replace(
            /'/g,
            "\\'"
        );

}


/* =========================================================
   UTILITY — COPY
   ========================================================= */

async function copyText(text) {

    try {

        if (
            navigator.clipboard &&
            navigator.clipboard.writeText
        ) {

            await navigator.clipboard.writeText(
                text
            );

            return true;

        }

    } catch (error) {

        console.warn(
            "Clipboard API:",
            error
        );

    }


    try {

        const textarea =
            document.createElement(
                "textarea"
            );


        textarea.value =
            text;


        textarea.style.position =
            "fixed";

        textarea.style.opacity =
            "0";


        document.body.appendChild(
            textarea
        );


        textarea.focus();

        textarea.select();


        document.execCommand(
            "copy"
        );


        textarea.remove();


        return true;

    } catch (error) {

        console.error(
            "Copy error:",
            error
        );

        return false;

    }

}


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.showAuth =
    showAuth;

window.logout =
    logout;

window.openPage =
    openPage;

window.openVipModal =
    openVipModal;

window.closeVipModal =
    closeVipModal;

window.confirmVipUnlock =
    confirmVipUnlock;

window.acceptVipTask =
    acceptVipTask;

window.acceptDatabaseTask =
    acceptDatabaseTask;

window.completeMyTask =
    completeMyTask;

window.calculateWithdrawal =
    calculateWithdrawal;

window.requestRecharge =
    requestRecharge;

window.requestWithdrawal =
    requestWithdrawal;

window.contactAdminTelegram =
    contactAdminTelegram;

window.copyReferralCode =
    copyReferralCode;

window.copyReferralLink =
    copyReferralLink;

window.shareReferral =
    shareReferral;

window.openAdminPanel =
    openAdminPanel;

window.approveRecharge =
    approveRecharge;

window.rejectRecharge =
    rejectRecharge;

window.approveVip =
    approveVip;

window.rejectVip =
    rejectVip;

window.approveWithdrawal =
    approveWithdrawal;

window.rejectWithdrawal =
    rejectWithdrawal;


/* =========================================================
   STARTUP MESSAGE
   ========================================================= */

console.log(
    "AME REELS app.js loaded successfully."
);
