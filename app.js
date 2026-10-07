/* =========================================================
   AME REELS - COMPLETE APPLICATION CONTROLLER
   Supabase connection is supplied by index.html.
   ========================================================= */
const db = supabaseClient;
let currentUser=null,currentProfile=null,selectedVip=null;
const INVITATION_CODE="AMEREELS";
const WITHDRAWAL_MINIMUM=2;
const WITHDRAWAL_FEE_RATE=.20;
const REFERRAL_REWARD_RATE=.12;
const VIP_LEVELS={
1:{unlock:9,daily:1.20,task:"Content Review"},
2:{unlock:27,daily:2.60,task:"Data Checking"},
3:{unlock:64,daily:3.60,task:"Content Tagging"},
4:{unlock:112,daily:5.00,task:"Research Task"},
5:{unlock:180,daily:6.60,task:"Advanced Review"},
6:{unlock:240,daily:9.00,task:"Advanced Data Task"},
7:{unlock:320,daily:14.00,task:"Premium Task"}
};
const RECHARGE_ADDRESSES={
"USDT TRC20":"TDivZhsq2g2is5GGouYE2iXfkJRwZLBxkY",
"USDT ERC20":"0xaea9be302fd28d897cdf1cad3d78326c65126c72",
"USDT BEP-20":"0xaea9be302fd28d897cdf1cad3d78326c65126c72",
"USDC ERC20":"0xaea9be302fd28d897cdf1cad3d78326c65126c72",
"USDC Polygon":"0xaea9be302fd28d897cdf1cad3d78326c65126c72"
};

document.addEventListener("DOMContentLoaded",()=>{setupAuth();buildVipGrid();prepareReferralRegistration();checkExistingSession();updateRechargeAddress();});
function $(id){return document.getElementById(id)}
function showAuth(mode="login"){
 $("authScreen").classList.remove("hidden");$("appScreen").classList.add("hidden");
 $("loginForm").classList.toggle("hidden",mode!=="login");$("registerForm").classList.toggle("hidden",mode!=="register");
 $("loginTab").classList.toggle("active",mode==="login");$("registerTab").classList.toggle("active",mode==="register");
}
function setupAuth(){
 db.auth.onAuthStateChange((event,session)=>{if(session?.user){setTimeout(()=>loadProfile(session.user),0)}});
}
function prepareReferralRegistration(){
 const p=new URLSearchParams(location.search);const ref=p.get("ref")||p.get("referral");
 if(ref){$("registerReferral").value=ref;$("registerNotice").textContent="Referral code detected: "+ref;$("registerNotice").classList.remove("hidden")}
}
async function checkExistingSession(){
 const {data}=await db.auth.getSession();if(data.session) await loadProfile(data.session.user); else showAuth("login");
}
async function registerUser(e){
 e.preventDefault();clearMessage("authMessage");
 const name=$("registerName").value.trim(),email=$("registerEmail").value.trim(),password=$("registerPassword").value,invite=$("invitationCode").value.trim(),ref=($("registerReferral").value||"").trim();
 if(invite!==INVITATION_CODE)return setMessage("authMessage","Invalid invitation code.");
 if(password.length<6)return setMessage("authMessage","Password must contain at least 6 characters.");
 let referredBy=null;
 if(ref){try{const r=await db.rpc("get_referrer_by_code",{p_referral_code:ref});if(!r.error&&r.data)referredBy=Array.isArray(r.data)?r.data[0]?.id:r.data.id;}catch(_){}}
 const {data,error}=await db.auth.signUp({email,password});
 if(error)return setMessage("authMessage",error.message);
 const user=data.user;if(!user)return setMessage("authMessage","Account created. Check your email to continue.");
 const referralCode=makeReferralCode();
 const profile={id:user.id,full_name:name,email,username:name,role:"member",vip_level:0,balance:0,earnings:0,referral_code:referralCode,referred_by:referredBy};
 const up=await db.from("profiles").upsert(profile,{onConflict:"id"});
 if(up.error)return setMessage("authMessage","Account created, but profile setup needs attention: "+up.error.message);
 if(referredBy)await db.from("referrals").insert({referrer_id:referredBy,referred_user_id:user.id,status:"pending",reward:0});
 setMessage("authMessage","Account created. Check your email if confirmation is required, then login.","success");
 showAuth("login");
}
async function loginUser(e){
 e.preventDefault();clearMessage("authMessage");
 const {data,error}=await db.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
 if(error)return setMessage("authMessage",error.message);
 await loadProfile(data.user);
}
async function resetPassword(){
 const email=prompt("Enter your account email:");
 if(!email)return;
 const {error}=await db.auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname});
 setMessage("authMessage",error?error.message:"Password reset email sent.","success");
}
async function loadProfile(user){
 currentUser=user;
 let {data,error}=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();
 if(error)return setMessage("authMessage",error.message);
 if(!data){
   const p={id:user.id,full_name:user.email?.split("@")[0]||"Member",email:user.email,username:user.email?.split("@")[0]||"Member",role:"member",vip_level:0,balance:0,earnings:0,referral_code:makeReferralCode()};
   const r=await db.from("profiles").insert(p).select().single();if(r.error)return setMessage("authMessage",r.error.message);data=r.data;
 }
 currentProfile=data;showApplication();
}
function showApplication(){
 $("authScreen").classList.add("hidden");$("appScreen").classList.remove("hidden");
 updateUserInterface();openPage("dashboardPage");loadDashboardData();showLoginOffer();
}
function updateUserInterface(){
 const name=currentProfile?.full_name||currentProfile?.username||"Member",vip=Number(currentProfile?.vip_level||0);
 $("topUsername").textContent=name;$("welcomeName").textContent=name;
 $("dashboardVip").textContent="VIP "+vip;$("dashboardVipStat").textContent="VIP "+vip;
 $("vipCurrentLevel").textContent="VIP "+vip;$("profileVip").textContent="VIP "+vip;
 $("profileName").textContent=name;$("profileEmail").textContent=currentProfile?.email||currentUser?.email||"-";
 $("profileBalance").textContent=money(currentProfile?.balance);$("profileEarnings").textContent=money(currentProfile?.earnings);
 $("dashboardEarnings").textContent=money(currentProfile?.earnings);$("earningTotal").textContent=money(currentProfile?.earnings);
 $("myReferralCode").textContent=currentProfile?.referral_code||"AME000001";
 $("referralLink").value=location.origin+location.pathname+"?ref="+encodeURIComponent(currentProfile?.referral_code||"");
 const admin=String(currentProfile?.role||"").toLowerCase()==="admin";
 $("adminMenuButton").classList.toggle("hidden",!admin);
 if(admin)loadAdminPanel();
 loadSavedWithdrawalAddress();
}
function showLoginOffer(){if(!sessionStorage.getItem("ame_offer_seen")){$("loginOffer").classList.remove("hidden");sessionStorage.setItem("ame_offer_seen","1")}}
function openPage(id){
 document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));const page=$(id);if(!page)return;
 page.classList.add("active");
 document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===id));
 if(id==="dashboardPage")loadDashboardData();
 if(id==="tasksPage"){loadAvailableTasks();loadMyTasks()}
 if(id==="earningsPage")loadEarningsHistory();
 if(id==="rechargePage"){updateRechargeAddress();loadTransactionHistory("rechargeHistory","recharge")}
 if(id==="withdrawPage")loadWithdrawalHistory();
 if(id==="referralPage")loadReferralHistory();
 if(id==="teamPage")loadTeamReport();
 if(id==="positionPage")loadAgentPosition();
 if(id==="investmentPage")loadInvestmentHistory();
 stopSectionMusic();
 window.scrollTo({top:0,behavior:"smooth"});
}
async function loadDashboardData(){
 await updateAvailableTaskCount();await loadMyTaskCount();await loadNotifications();
}
async function updateAvailableTaskCount(){
 const vip=Number(currentProfile?.vip_level||0);let count=vip?1:0;
 const {count:c,error}=await db.from("user_tasks").select("*",{count:"exact",head:true}).eq("user_id",currentUser.id).eq("status","available");
 if(!error&&typeof c==="number")count=Math.max(count,c);
 $("availableTaskCount").textContent=count;
}
async function loadMyTaskCount(){
 const {count,error}=await db.from("user_tasks").select("*",{count:"exact",head:true}).eq("user_id",currentUser.id);
 $("myTaskCount").textContent=!error&&typeof count==="number"?count:0;
}
function buildVipGrid(){
 const box=$("vipGrid");box.innerHTML="";
 Object.entries(VIP_LEVELS).forEach(([level,v])=>{
  const card=document.createElement("div");card.className="task-card";
  card.innerHTML=`<div><h3>VIP ${level}</h3><p>${escapeHtml(v.task)} · Daily opportunity ${money(v.daily)}</p><small>Activation amount: ${money(v.unlock)}</small></div><button class="small-btn" onclick="openVipModal(${level})">VIEW</button>`;
  box.appendChild(card);
 });
}
function openVipModal(level){
 selectedVip=Number(level);const v=VIP_LEVELS[level];$("modalVipTitle").textContent="VIP "+level;
 $("modalVipBody").innerHTML=`<p><b>${escapeHtml(v.task)}</b></p><p>Activation amount: <b>${money(v.unlock)}</b></p><p>Displayed daily opportunity: <b>${money(v.daily)}</b></p><p class="muted">VIP activation is submitted for backend/admin processing. No balance is debited by this screen.</p>`;
 $("vipModalMessage").textContent="";$("vipModal").classList.remove("hidden");
}
function closeVipModal(){closeModal("vipModal")}
async function confirmVipUnlock(){
 if(!selectedVip)return;const v=VIP_LEVELS[selectedVip];
 const {error}=await db.from("transactions").insert({user_id:currentUser.id,type:"vip_activation",amount:v.unlock,status:"pending",reference:"VIP-"+Date.now(),description:`VIP ${selectedVip} activation request`});
 setMessage("vipModalMessage",error?error.message:"VIP activation request submitted.","success");
 if(!error)closeVipModal();
}
async function loadAvailableTasks(){
 const box=$("availableTasks");box.innerHTML="";
 const vip=Number(currentProfile?.vip_level||0);
 if(!vip){box.innerHTML='<div class="notice">Activate a VIP level to access VIP task opportunities.</div>';return}
 const v=VIP_LEVELS[vip]||VIP_LEVELS[1];
 const card=document.createElement("div");card.className="task-card";
 card.innerHTML=`<div><h3>${escapeHtml(v.task)}</h3><p>VIP ${vip} task opportunity · ${money(v.daily)}</p></div><button class="small-btn" onclick="acceptVipTask(${vip})">ACCEPT</button>`;
 box.appendChild(card);
}
async function acceptVipTask(level){
 const {data,error}=await db.rpc("accept_task",{p_task_type:"vip_task",p_vip_level:Number(level)});
 if(error)return alert(error.message);
 alert("Task accepted.");loadAvailableTasks();loadMyTasks();
}
async function loadMyTasks(){
 const box=$("myTasks");box.innerHTML="";
 const {data,error}=await db.rpc("get_my_task_history");
 if(error||!data){box.innerHTML='<div class="notice">No task records found.</div>';return}
 const rows=Array.isArray(data)?data:[data];if(!rows.length){box.innerHTML='<div class="notice">No task records found.</div>';return}
 rows.slice(0,30).forEach(r=>{const el=document.createElement("div");el.className="task-card";el.innerHTML=`<div><h3>${escapeHtml(r.task_type||r.title||"Task")}</h3><p>Status: ${escapeHtml(r.status||"pending")}</p></div><span>${money(r.reward||r.amount||0)}</span>`;box.appendChild(el)});
}
async function loadEarningsHistory(){await loadTransactionHistory("earningsHistory","earnings")}
async function loadTransactionHistory(target,type){
 const box=$(target);if(!box)return;box.innerHTML="";
 let q=db.from("transactions").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(30);
 if(type==="recharge")q=q.eq("type","recharge");
 const {data,error}=await q;if(error||!data?.length){box.innerHTML='<div class="notice">No records found.</div>';return}
 data.forEach(r=>{const el=document.createElement("div");el.className="task-card";el.innerHTML=`<div><h3>${escapeHtml(r.type||"Transaction")}</h3><p>${escapeHtml(r.status||"pending")} · ${formatDate(r.created_at)}</p></div><b>${money(r.amount)}</b>`;box.appendChild(el)});
}
async function requestRecharge(){
 const amount=Number($("rechargeAmount").value),network=$("rechargeNetwork").value,address=RECHARGE_ADDRESSES[network];
 if(!(amount>0))return setMessage("rechargeMessage","Enter a valid amount.");
 const {error}=await db.from("transactions").insert({user_id:currentUser.id,type:"recharge",amount,status:"pending",reference:"RECHARGE-"+Date.now(),description:`Recharge ${network} to ${address}`});
 if(error)return setMessage("rechargeMessage",error.message);
 setMessage("rechargeMessage","Recharge request submitted for admin review.","success");$("rechargeAmount").value="";loadTransactionHistory("rechargeHistory","recharge");
}
function updateRechargeAddress(){$("rechargeAddress").value=RECHARGE_ADDRESSES[$("rechargeNetwork").value]||""}
async function copyRechargeAddress(){await copyText($("rechargeAddress").value);setMessage("rechargeMessage","Address copied.","success")}
async function loadWithdrawalHistory(){
 const box=$("withdrawHistory");box.innerHTML="";
 const {data,error}=await db.from("withdrawals").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(30);
 if(error||!data?.length){box.innerHTML='<div class="notice">No withdrawal records found.</div>';return}
 data.forEach(r=>{const el=document.createElement("div");el.className="task-card";el.innerHTML=`<div><h3>${escapeHtml(r.network||"Withdrawal")}</h3><p>${escapeHtml(r.status||"pending")} · ${formatDate(r.created_at)}</p></div><b>${money(r.amount)}</b>`;box.appendChild(el)});
}
function calculateWithdrawal(){
 const amount=Number($("withdrawAmount").value)||0,fee=amount*WITHDRAWAL_FEE_RATE,net=Math.max(0,amount-fee);
 $("withdrawGross").textContent=money(amount);$("withdrawFee").textContent=money(fee);$("withdrawNet").textContent=money(net);
}
async function requestWithdrawal(){
 const amount=Number($("withdrawAmount").value),network=$("withdrawNetwork").value,address=$("withdrawAddress").value.trim(),pin=$("withdrawPin").value.trim();
 if(amount<WITHDRAWAL_MINIMUM)return setMessage("withdrawMessage","Minimum withdrawal is $2.00.");
 if(!address)return setMessage("withdrawMessage","Set your withdrawal address first.");
 if(!/^\\d{4}$/.test(pin))return setMessage("withdrawMessage","Withdrawal PIN must be exactly 4 digits.");
 if(Number(currentProfile?.balance||0)<amount)return setMessage("withdrawMessage","Insufficient available balance.");
 /* The secure SQL/RPC supplied later will verify the PIN and locked address server-side. */
 const secure=await db.rpc("request_withdrawal_secure",{p_amount:amount,p_network:network,p_wallet_address:address,p_withdrawal_pin:pin});
 if(!secure.error){setMessage("withdrawMessage","Withdrawal request submitted.","success");$("withdrawPin").value="";loadWithdrawalHistory();return}
 const fallback=await db.rpc("request_withdrawal",{p_amount:amount,p_network:network,p_wallet_address:address});
 if(fallback.error)return setMessage("withdrawMessage","Secure withdrawal backend is not installed yet. Run the SQL provided with this project before submitting withdrawals.");
 setMessage("withdrawMessage","Request submitted. Secure PIN verification will become active after the SQL migration is installed.","success");$("withdrawPin").value="";loadWithdrawalHistory();
}
async function loadSavedWithdrawalAddress(){
 $("withdrawAddress").value=currentProfile?.withdrawal_address||"";
}
function openPinModal(){$("newPin").value="";$("confirmPin").value="";$("pinMessage").textContent="";$("pinModal").classList.remove("hidden")}
async function saveWithdrawalPin(){
 const a=$("newPin").value.trim(),b=$("confirmPin").value.trim();
 if(!/^\\d{4}$/.test(a))return setMessage("pinMessage","PIN must be exactly 4 digits.");
 if(a!==b)return setMessage("pinMessage","PINs do not match.");
 const r=await db.rpc("set_withdrawal_pin",{p_pin:a});
 if(r.error)return setMessage("pinMessage","PIN backend is not installed yet. Run the SQL migration first.");
 setMessage("pinMessage","Withdrawal PIN saved.","success");setTimeout(()=>closeModal("pinModal"),600);
}
function openAddressModal(){
 $("newWithdrawalAddress").value=currentProfile?.withdrawal_address||"";
 $("addressMessage").textContent="";$("addressModal").classList.remove("hidden");
}
async function saveWithdrawalAddress(){
 const address=$("newWithdrawalAddress").value.trim(),network=$("addressNetwork").value;
 if(!address)return setMessage("addressMessage","Enter a wallet address.");
 const r=await db.rpc("set_withdrawal_address",{p_network:network,p_address:address});
 if(r.error)return setMessage("addressMessage","Address-lock backend is not installed yet. Run the SQL migration first.");
 currentProfile.withdrawal_address=address;currentProfile.withdrawal_network=network;updateUserInterface();
 setMessage("addressMessage","Withdrawal address saved and locked.","success");setTimeout(()=>closeModal("addressModal"),700);
}
async function loadReferralHistory(){
 const box=$("referralHistory");box.innerHTML="";
 const {data,error}=await db.from("referrals").select("*").or(`referrer_id.eq.${currentUser.id},referred_user_id.eq.${currentUser.id}`).order("created_at",{ascending:false}).limit(30);
 if(error||!data?.length){box.innerHTML='<div class="notice">No referral records found.</div>';return}
 data.forEach(r=>{const el=document.createElement("div");el.className="task-card";el.innerHTML=`<div><h3>Referral</h3><p>Status: ${escapeHtml(r.status||"pending")}</p></div><b>${money(r.reward||0)}</b>`;box.appendChild(el)});
}
async function loadTeamReport(){
 const box=$("teamList");box.innerHTML="";
 const {data,error}=await db.from("profiles").select("id,full_name,email,username,vip_level,earnings,created_at").eq("referred_by",currentUser.id).order("created_at",{ascending:false});
 if(error||!data){box.innerHTML='<div class="notice">Team report backend is not available.</div>';return}
 $("teamCount").textContent=data.length;$("teamActive").textContent=data.filter(x=>Number(x.vip_level)>0).length;$("teamEarnings").textContent=money(data.reduce((s,x)=>s+Number(x.earnings||0),0));
 if(!data.length)box.innerHTML='<div class="notice">No referred members yet.</div>';
 data.forEach(x=>{const el=document.createElement("div");el.className="task-card";el.innerHTML=`<div><h3>${escapeHtml(x.full_name||x.username||"Member")}</h3><p>VIP ${Number(x.vip_level||0)} · ${escapeHtml(x.email||"")}</p></div>`;box.appendChild(el)});
}
function loadAgentPosition(){
 const vip=Number(currentProfile?.vip_level||0),pct=Math.min(100,vip/7*100),position=vip>=7?"Senior Agent":vip>=5?"Agent":vip>=2?"Junior Agent":"Member";
 $("agentPosition").textContent=position;$("positionProgress").style.width=pct+"%";$("positionProgressText").textContent=Math.round(pct)+"%";
 $("agentPositionText").textContent=vip?`Your VIP level is ${vip}. Continue building activity to qualify for higher positions.`:"Build your activity and referral team to qualify for higher positions.";
}
async function loadInvestmentHistory(){
 const box=$("investmentHistory");box.innerHTML='<div class="notice">Investment history will appear here when the compliant investment backend is configured.</div>';
}
function submitInvestment(){setMessage("investmentMessage","Investment activation is not enabled until the compliant backend and terms are configured.","info")}
function submitAgentApplication(){const reason=$("agentReason").value.trim();if(reason.length<10)return setMessage("agentMessage","Please provide more detail.");setMessage("agentMessage","Application prepared. Connect the agent-application backend to submit it.","info")}
function openPinModal(){ $("newPin").value="";$("confirmPin").value="";$("pinMessage").textContent="";$("pinModal").classList.remove("hidden") }
function closeModal(id){$(id)?.classList.add("hidden")}
function showMessage(id,msg,type){setMessage(id,msg,type)}
function setMessage(id,msg,type=""){const el=$(id);if(!el)return;el.textContent=msg;el.style.color=type==="success"?"#68e0ad":type==="info"?"#a9b7d5":"#ff9b9b"}
function clearMessage(id){setMessage(id,"")}
async function copyReferralCode(){await copyText($("myReferralCode").textContent);setMessage("referralHistory","Referral code copied.","success")}
async function copyReferralLink(){await copyText($("referralLink").value);setMessage("referralHistory","Referral link copied.","success")}
function makeReferralCode(){return"AME"+Math.floor(100000+Math.random()*900000)}
function money(v){return"$"+Number(v||0).toFixed(2)}
function formatDate(v){if(!v)return"-";return new Date(v).toLocaleString()}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
async function copyText(t){if(navigator.clipboard)await navigator.clipboard.writeText(t);else{const x=document.createElement("textarea");x.value=t;document.body.appendChild(x);x.select();document.execCommand("copy");x.remove()}}
async function loadNotifications(){}
function stopSectionMusic(){if(window._sectionAudio){window._sectionAudio.pause();window._sectionAudio.currentTime=0;window._sectionAudio=null}}
function toggleSectionMusic(section){
 stopSectionMusic();const audio=new Audio(section==="lucky"?"./lucky-draw.mp3":"./point-mall.mp3");audio.loop=true;window._sectionAudio=audio;
 audio.play().then(()=>{const id=section==="lucky"?"luckyMusicBtn":"pointsMusicBtn";$(id).textContent="🔊 Playing";}).catch(()=>{const id=section==="lucky"?"luckyMusicBtn":"pointsMusicBtn";$(id).textContent="▶ Tap to play"});
}
async function openAdminPanel(){if(isCurrentUserAdmin())openPage("adminPage")}
function isCurrentUserAdmin(){return String(currentProfile?.role||"").toLowerCase()==="admin"}
async function loadAdminPanel(){
 if(!isCurrentUserAdmin())return;
 const [users,recharges,withdrawals,vips]=await Promise.all([
  db.from("profiles").select("*").order("created_at",{ascending:false}).limit(100),
  db.from("transactions").select("*").eq("type","recharge").eq("status","pending").order("created_at",{ascending:false}),
  db.from("withdrawals").select("*").eq("status","pending").order("created_at",{ascending:false}),
  db.from("transactions").select("*").eq("type","vip_activation").eq("status","pending").order("created_at",{ascending:false})
 ]);
 renderAdminUsers(users.data||[]);renderAdminRequests("adminRechargeList",recharges.data||[],"recharge");renderAdminRequests("adminWithdrawalList",withdrawals.data||[],"withdrawal");renderAdminRequests("adminVipList",vips.data||[],"vip");
 $("adminUsers").textContent=(users.data||[]).length;$("adminRechargeCount").textContent=(recharges.data||[]).length;$("adminWithdrawCount").textContent=(withdrawals.data||[]).length;
}
function renderAdminUsers(rows){
 const box=$("adminUsersList");box.innerHTML="";rows.forEach(r=>{const el=document.createElement("div");el.className="admin-item";el.innerHTML=`<div><h3>${escapeHtml(r.full_name||r.username||"Member")}</h3><p>${escapeHtml(r.email||"")} · VIP ${Number(r.vip_level||0)} · Balance ${money(r.balance)}</p></div><button class="small-btn" onclick="viewMember('${r.id}')">VIEW</button>`;box.appendChild(el)});
}
function renderAdminRequests(target,rows,type){
 const box=$(target);box.innerHTML="";if(!rows.length){box.innerHTML='<div class="notice">No pending requests.</div>';return}
 rows.forEach(r=>{const el=document.createElement("div");el.className="admin-item";let title=type==="vip"?(r.description||"VIP activation"):type==="recharge"?"Recharge":"Withdrawal";el.innerHTML=`<div><h3>${escapeHtml(title)}</h3><p>${money(r.amount)} · ${formatDate(r.created_at)}</p></div><div><button class="small-btn" onclick="viewMember('${r.user_id}')">MEMBER</button> ${type==="recharge"?`<button class="small-btn" onclick="approveRecharge('${r.id}')">APPROVE</button>`:type==="withdrawal"?`<button class="small-btn" onclick="processWithdrawal('${r.id}','approved')">APPROVE</button>`:""}</div>`;box.appendChild(el)});
}
async function viewMember(id){
 const {data,error}=await db.from("profiles").select("*").eq("id",id).maybeSingle();
 if(error||!data)return alert(error?.message||"Member not found.");
 $("memberDetails").innerHTML=`<div class="cards">
 <div class="task-card"><span>Full name</span><b>${escapeHtml(data.full_name||"-")}</b></div>
 <div class="task-card"><span>Email</span><b>${escapeHtml(data.email||"-")}</b></div>
 <div class="task-card"><span>Username</span><b>${escapeHtml(data.username||"-")}</b></div>
 <div class="task-card"><span>Phone</span><b>${escapeHtml(data.phone||"-")}</b></div>
 <div class="task-card"><span>Role</span><b>${escapeHtml(data.role||"member")}</b></div>
 <div class="task-card"><span>VIP</span><b>${Number(data.vip_level||0)}</b></div>
 <div class="task-card"><span>Balance</span><b>${money(data.balance)}</b></div>
 <div class="task-card"><span>Earnings</span><b>${money(data.earnings)}</b></div>
 <div class="task-card"><span>Referral Code</span><b>${escapeHtml(data.referral_code||"-")}</b></div>
 <div class="task-card"><span>Created</span><b>${formatDate(data.created_at)}</b></div>
 </div>`;
 $("memberModal").classList.remove("hidden");
}
async function approveRecharge(id){
 const r=await db.rpc("admin_approve_recharge",{p_transaction_id:id});
 if(r.error)alert(r.error.message);else loadAdminPanel();
}
async function processWithdrawal(id,action){
 const r=await db.rpc("admin_process_withdrawal",{p_withdrawal_id:id,p_action:action});
 if(r.error)alert(r.error.message);else loadAdminPanel();
}
async function logoutUser(){await db.auth.signOut();currentUser=null;currentProfile=null;$("appScreen").classList.add("hidden");showAuth("login")}
function contactAdminWhatsApp(){const whatsappNumber="254111840669";const whatsapp="https://wa.me/"+whatsappNumber;window.open(whatsapp,"_blank","noopener,noreferrer")}
function joinWhatsAppGroup(){const groupLink="https://chat.whatsapp.com/FCS4uDnwTlzBNoH6N4wtTt?s=cl&p=a&ilr=4&iam=0";window.open(groupLink,"_blank","noopener,noreferrer")}
window.showAuth=showAuth;window.loginUser=loginUser;window.registerUser=registerUser;window.resetPassword=resetPassword;window.openPage=openPage;window.openVipModal=openVipModal;window.closeVipModal=closeVipModal;window.confirmVipUnlock=confirmVipUnlock;window.acceptVipTask=acceptVipTask;window.requestRecharge=requestRecharge;window.updateRechargeAddress=updateRechargeAddress;window.copyRechargeAddress=copyRechargeAddress;window.requestWithdrawal=requestWithdrawal;window.calculateWithdrawal=calculateWithdrawal;window.openPinModal=openPinModal;window.saveWithdrawalPin=saveWithdrawalPin;window.openAddressModal=openAddressModal;window.saveWithdrawalAddress=saveWithdrawalAddress;window.closeModal=closeModal;window.copyReferralCode=copyReferralCode;window.copyReferralLink=copyReferralLink;window.submitInvestment=submitInvestment;window.submitAgentApplication=submitAgentApplication;window.toggleSectionMusic=toggleSectionMusic;window.openAdminPanel=openAdminPanel;window.viewMember=viewMember;window.approveRecharge=approveRecharge;window.processWithdrawal=processWithdrawal;window.logoutUser=logoutUser;window.contactAdminWhatsApp=contactAdminWhatsApp;window.joinWhatsAppGroup=joinWhatsAppGroup;
