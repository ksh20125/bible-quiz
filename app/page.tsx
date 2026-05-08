"use client";

import { useEffect, useMemo, useState } from "react";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc, increment, serverTimestamp, onSnapshot, collection, query, orderBy, getDocs, where, writeBatch, addDoc, limit } from "firebase/firestore";
import { auth, db } from "../firebase";

type ViewState = "SPLASH" | "REGISTER" | "HOME" | "QUIZ_SETUP" | "QUIZ_PLAY" | "QUIZ_RESULT" | "LEADERBOARD" | "MY_RECORDS" | "DAILY_QUIZ" | "ADMIN";
type Category = "구약" | "신약" | "전체";
type Difficulty = "쉬움" | "보통" | "어려움";

type Question = {
  id: string;
  category: "구약" | "신약";
  difficulty: Difficulty;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  points: number;
};

type LeaderboardEntry = { uid: string; name: string; department: string; score: number; };
type UserDoc = {
  uid: string;
  name: string;
  department: string;
  score: number;
  totalAttempts: number;
  correctCount: number;
  wrongQuestions: number[];
  dailyCompletedDate: string;
  quizHistory?: QuizHistoryItem[];
};
type QuestionDoc = Omit<Question, "id"> & {
  id: string;
  is_daily?: boolean;
  active?: boolean;
  createdAt?: unknown;
};
type QuizHistoryItem = { date: string; score: number; accuracy: number; };
type DailyQuestion = { id: string; text: string; options: string[]; correctAnswerIndex: number; explanation: string; };

const getUtcDateKey = (date = new Date()): string => date.toISOString().slice(0, 10);

const shuffle = <T,>(arr: T[]): T[] => {
  const copied = [...arr];
  for (let i = copied.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
};

export default function App() {
  const [view, setView] = useState<ViewState>("SPLASH");
  const [userData, setUserData] = useState<UserDoc | null>(null);

  // Auth/Register State
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("청년부");
  const [isRegistering, setIsRegistering] = useState(false);

  // Quiz Setup State
  const [setupCategory, setSetupCategory] = useState<Category>("전체");
  const [setupDifficulty, setSetupDifficulty] = useState<Difficulty>("보통");

  // Quiz Play State
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  
  // Quiz Session Results
  const [sessionScore, setSessionScore] = useState(0);
  const [sessionCorrectCount, setSessionCorrectCount] = useState(0);

  // Leaderboard
  const [lbTab, setLbTab] = useState<"전체" | "부서별">("전체");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // My Records
  const [quizHistory, setQuizHistory] = useState<QuizHistoryItem[]>([]);

  // Daily Quiz
  const [dailyQuestion, setDailyQuestion] = useState<DailyQuestion | null>(null);
  const [dailyCompleted, setDailyCompleted] = useState(false);
  const [dailyAnswerChecked, setDailyAnswerChecked] = useState(false);
  const [dailySelectedOption, setDailySelectedOption] = useState<number | null>(null);
  const [dailyCorrect, setDailyCorrect] = useState(false);

  // Admin
  const [tapCount, setTapCount] = useState(0);
  const [showAdminPopup, setShowAdminPopup] = useState(false);
  const [adminPwInput, setAdminPwInput] = useState("");
  const [adminPwError, setAdminPwError] = useState(false);
  const [adminTab, setAdminTab] = useState<"questions" | "contest" | "participants" | "reset">("questions");
  const [adminQuestions, setAdminQuestions] = useState<QuestionDoc[]>([]);
  const [newQJson, setNewQJson] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [contestStart, setContestStart] = useState("");
  const [contestEnd, setContestEnd] = useState("");
  const [contestSaved, setContestSaved] = useState(false);
  const [participants, setParticipants] = useState<UserDoc[]>([]);
  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => (b.score || 0) - (a.score || 0)),
    [participants]
  );

  useEffect(() => {
    let unsubscribeAuth: (() => void) | null = null;
    const splashTimer = setTimeout(() => {
      unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
          try {
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              setUserData(userDoc.data() as UserDoc);
              setView("HOME");
            } else {
              setView("REGISTER");
            }
          } catch (error) {
            setView("REGISTER");
          }
        } else {
          setView("REGISTER");
        }
      });
    }, 2000);
    return () => {
      clearTimeout(splashTimer);
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

  // Leaderboard real-time subscription
  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("score", "desc"), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      setLeaderboard(snap.docs.map(d => ({ uid: d.id, ...d.data() } as LeaderboardEntry)));
    });
    return () => unsub();
  }, []);

  // Load daily question
  const loadDailyQuestion = async () => {
    try {
      const snap = await getDocs(query(collection(db, "questions"), where("is_daily", "==", true), where("active", "==", true)));
      if (!snap.empty) {
        const docs = snap.docs;
        const rand = docs[Math.floor(Math.random() * docs.length)];
        const d = rand.data();
        setDailyQuestion({ id: rand.id, text: d.text, options: d.options, correctAnswerIndex: d.correctAnswerIndex, explanation: d.explanation });
      } else {
        setDailyQuestion(null);
      }
    } catch {
      setDailyQuestion(null);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert("이름을 입력해주세요.");
    
    setIsRegistering(true);
    try {
      const userCredential = await signInAnonymously(auth);
      const user = userCredential.user;
      console.log("Anonymous User UID:", user.uid);

      const newUser = {
        uid: user.uid,
        name: name.trim(),
        department,
        score: 0,
        totalAttempts: 0,
        correctCount: 0,
        wrongQuestions: [],
        dailyCompletedDate: "",
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, "users", user.uid), newUser);
      setUserData(newUser);
      setView("HOME");
    } catch (error: any) {
      console.error("Registration error:", error);
      alert(`등록 중 오류가 발생했습니다: ${error.message || error}`);
    } finally {
      setIsRegistering(false);
    }
  };

  const startQuizSetup = () => {
    setView("QUIZ_SETUP");
  };

  const startQuizPlay = async () => {
    try {
      const constraints = [where("active", "==", true), where("difficulty", "==", setupDifficulty)];
      if (setupCategory !== "전체") constraints.push(where("category", "==", setupCategory));
      const snap = await getDocs(query(collection(db, "questions"), ...constraints));
      const sampled = shuffle(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Question, "id">) }))
      ).slice(0, 10);

      if (sampled.length === 0) {
        alert("조건에 맞는 활성 문제를 찾지 못했습니다.");
        return;
      }

      setQuizQuestions(sampled);
      setCurrentQIndex(0);
      setSelectedOption(null);
      setIsAnswerChecked(false);
      setSessionScore(0);
      setSessionCorrectCount(0);
      setView("QUIZ_PLAY");
    } catch (error) {
      console.error("Error loading questions:", error);
      alert("문제를 불러오는 중 오류가 발생했습니다.");
    }
  };

  const abortQuiz = () => {
    if (window.confirm("퀴즈를 포기하시겠습니까? 점수는 저장되지 않습니다.")) {
      setView("HOME");
    }
  };

  const handleOptionClick = (index: number) => {
    if (isAnswerChecked) return;
    setSelectedOption(index);
    setIsAnswerChecked(true);

    const question = quizQuestions[currentQIndex];
    if (index === question.correctAnswerIndex) {
      setSessionScore(prev => prev + question.points);
      setSessionCorrectCount(prev => prev + 1);
    }
  };

  const handleNextQuestion = async () => {
    if (currentQIndex < quizQuestions.length - 1) {
      setCurrentQIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswerChecked(false);
    } else {
      await finishQuiz();
    }
  };

  const finishQuiz = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const questionCount = quizQuestions.length || 10;
        const accuracy = Math.round((sessionCorrectCount / questionCount) * 100);
        const today = getUtcDateKey();
        const newHistory: QuizHistoryItem = { date: today, score: sessionScore, accuracy };
        const updatedHistory = [newHistory, ...quizHistory].slice(0, 5);
        await updateDoc(userDocRef, {
          score: increment(sessionScore),
          totalAttempts: increment(questionCount),
          correctCount: increment(sessionCorrectCount),
          quizHistory: updatedHistory
        });
        setQuizHistory(updatedHistory);
        setUserData((prev) => prev ? ({
          ...prev,
          score: (prev.score || 0) + sessionScore,
          totalAttempts: (prev.totalAttempts || 0) + questionCount,
          correctCount: (prev.correctCount || 0) + sessionCorrectCount,
          quizHistory: updatedHistory
        }) : prev);
      }
    } catch (error) {
      console.error("Error updating score:", error);
    }
    setView("QUIZ_RESULT");
  };

  // ---------------------------------------------------------
  // RENDER VIEWS
  // ---------------------------------------------------------

  if (view === "SPLASH") {
    return (
      <div className="container center animation-fade-in">
        <div className="logo-circle"><span className="logo-text">✝</span></div>
        <h1 className="app-name">성경퀴즈</h1>
      </div>
    );
  }

  if (view === "REGISTER") {
    return (
      <div className="container center animation-fade-in">
        <h1 className="app-name small">성경퀴즈 시작하기</h1>
        <div className="card">
          <h2 className="card-title">회원 등록</h2>
          <form onSubmit={handleRegister} className="form">
            <div className="form-group">
              <label>이름</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="이름을 입력하세요" required className="input" />
            </div>
            <div className="form-group">
              <label>소속 부서</label>
              <select value={department} onChange={e => setDepartment(e.target.value)} className="input">
                <option value="장년부">장년부</option>
                <option value="청년부">청년부</option>
                <option value="중고등부">중고등부</option>
                <option value="어린이부">어린이부</option>
                <option value="교역자">교역자</option>
              </select>
            </div>
            <button type="submit" disabled={isRegistering} className="btn-primary">
              {isRegistering ? "등록 중..." : "등록하고 시작하기"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === "HOME") {
    const myRank = leaderboard.findIndex(e => e.uid === userData?.uid) + 1;
    const top3 = leaderboard.slice(0, 3);
    const medals = ["🥇", "🥈", "🥉"];
    return (
      <div className="container animation-fade-in page-with-nav">
        <h1 className="app-name small" style={{textAlign: "left", marginTop: "10px", cursor: "default", userSelect: "none"}} onClick={() => { const next = tapCount + 1; setTapCount(next); if (next >= 5) { setTapCount(0); setShowAdminPopup(true); setAdminPwInput(""); setAdminPwError(false); } }}>성경퀴즈</h1>
        {showAdminPopup && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:"white",borderRadius:"16px",padding:"28px 24px",width:"300px",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
              <h3 style={{margin:"0 0 8px",color:"var(--color-primary)",fontSize:"18px"}}>🔐 관리자 접근</h3>
              <p style={{margin:"0 0 16px",fontSize:"13px",color:"#888"}}>비밀번호를 입력하세요</p>
              <input id="admin-pw-input" type="password" value={adminPwInput} onChange={e => setAdminPwInput(e.target.value)} onKeyDown={async e => { if (e.key !== "Enter") return; const cfgDoc = await getDoc(doc(db, "admin_config", "settings")); const cfg = cfgDoc.exists() ? cfgDoc.data() : null; const pw = typeof cfg?.adminPassword === "string" ? cfg.adminPassword : null; if (pw && adminPwInput === pw) { setShowAdminPopup(false); setAdminTab("questions"); const qSnap = await getDocs(collection(db, "questions")); setAdminQuestions(qSnap.docs.map(d=>({id: d.id, ...(d.data() as Omit<QuestionDoc, "id">)}))); const ps = await getDocs(collection(db, "users")); setParticipants(ps.docs.map(d=>d.data() as UserDoc)); setContestStart(cfg?.contestStart||""); setContestEnd(cfg?.contestEnd||""); setView("ADMIN"); } else { setAdminPwError(true); } }} placeholder="비밀번호 입력 후 Enter" className="input" style={{marginBottom:"8px"}} />
              {adminPwError && <p style={{color:"red",fontSize:"13px",margin:"0 0 8px"}}>틀린 비밀번호입니다</p>}
              <div style={{display:"flex",gap:"8px",marginTop:"8px"}}>
                <button className="btn-primary" style={{margin:0,flex:1}} onClick={async () => { const cfgDoc = await getDoc(doc(db, "admin_config", "settings")); const cfg = cfgDoc.exists() ? cfgDoc.data() : null; const pw = typeof cfg?.adminPassword === "string" ? cfg.adminPassword : null; if (pw && adminPwInput === pw) { setShowAdminPopup(false); setAdminTab("questions"); const qSnap = await getDocs(collection(db, "questions")); setAdminQuestions(qSnap.docs.map(d=>({id: d.id, ...(d.data() as Omit<QuestionDoc, "id">)}))); const ps = await getDocs(collection(db, "users")); setParticipants(ps.docs.map(d=>d.data() as UserDoc)); setContestStart(cfg?.contestStart||""); setContestEnd(cfg?.contestEnd||""); setView("ADMIN"); } else { setAdminPwError(true); } }}>접근</button>
                <button className="btn-secondary" style={{flex:1}} onClick={() => setShowAdminPopup(false)}>취소</button>
              </div>
            </div>
          </div>
        )}
        <div className="user-score-card">
          <div className="user-info">
            <span className="department-badge">{userData?.department}</span>
            <span className="user-name">{userData?.name} 님</span>
          </div>
          <div className="score-info">
            <span className="score-label">현재 점수</span>
            <span className="score-value">{userData?.score || 0}점</span>
          </div>
        </div>
        <div className="action-buttons">
          <button className="btn-primary large" onClick={startQuizSetup}>퀴즈 시작</button>
          <button className="btn-secondary" onClick={() => { loadDailyQuestion(); const today = getUtcDateKey(); setDailyCompleted(userData?.dailyCompletedDate === today); setDailyAnswerChecked(false); setDailySelectedOption(null); setDailyCorrect(false); setView("DAILY_QUIZ"); }}>✨ 일일 말씀 퀴즈 (+15점)</button>
        </div>
        <div className="ranking-preview">
          <h3 className="ranking-title">🏆 TOP 3 명예의 전당</h3>
          <ul className="ranking-list">
            {top3.length === 0 ? <li style={{color:"#aaa",fontSize:"14px"}}>아직 참여자가 없습니다</li> : top3.map((e, i) => (
              <li key={e.uid} className="ranking-item">
                <span className="rank">{i + 1}</span>
                <span className="rank-name">{e.name} ({e.department})</span>
                <span className="rank-score">{e.score}점</span>
              </li>
            ))}
          </ul>
        </div>
        <nav className="bottom-nav">
          <button id="nav-home" className="nav-btn active"><span className="nav-icon">🏠</span>홈</button>
          <button id="nav-leaderboard" className="nav-btn" onClick={() => setView("LEADERBOARD")}><span className="nav-icon">🏆</span>리더보드</button>
          <button id="nav-myrecords" className="nav-btn" onClick={() => { setQuizHistory(userData?.quizHistory || []); setView("MY_RECORDS"); }}><span className="nav-icon">📊</span>내 기록</button>
        </nav>
      </div>
    );
  }


  if (view === "QUIZ_SETUP") {
    return (
      <div className="container animation-fade-in" style={{ backgroundColor: "white" }}>
        <div className="quiz-header">
          <button className="close-btn" onClick={() => setView("HOME")}>✕</button>
          <h2 style={{margin: 0, fontSize: "18px", color: "var(--color-primary)"}}>퀴즈 설정</h2>
          <div style={{width: "24px"}}></div>
        </div>
        
        <div className="form" style={{marginTop: "20px"}}>
          <div className="form-group">
            <label>카테고리</label>
            <div className="toggle-group">
              {["구약", "신약", "전체"].map(cat => (
                <button key={cat} className={`toggle-btn ${setupCategory === cat ? 'active' : ''}`} onClick={() => setSetupCategory(cat as Category)}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>난이도 (문제당 점수)</label>
            <div className="toggle-group">
              <button className={`toggle-btn ${setupDifficulty === '쉬움' ? 'active' : ''}`} onClick={() => setSetupDifficulty('쉬움')}>
                쉬움<br/><small style={{opacity: 0.8}}>10점</small>
              </button>
              <button className={`toggle-btn ${setupDifficulty === '보통' ? 'active' : ''}`} onClick={() => setSetupDifficulty('보통')}>
                보통<br/><small style={{opacity: 0.8}}>20점</small>
              </button>
              <button className={`toggle-btn ${setupDifficulty === '어려움' ? 'active' : ''}`} onClick={() => setSetupDifficulty('어려움')}>
                어려움<br/><small style={{opacity: 0.8}}>30점</small>
              </button>
            </div>
          </div>
        </div>

        <div style={{marginTop: "auto", paddingTop: "20px"}}>
          <button className="btn-primary large" onClick={startQuizPlay}>퀴즈 시작하기</button>
        </div>
      </div>
    );
  }

  if (view === "QUIZ_PLAY") {
    const question = quizQuestions[currentQIndex];
    if (!question) return null;

    const progressPercent = ((currentQIndex) / quizQuestions.length) * 100;

    return (
      <div className="container animation-fade-in" style={{ backgroundColor: "white" }}>
        <div className="quiz-header">
          <button className="close-btn" onClick={abortQuiz}>✕</button>
          <h2 style={{margin: 0, fontSize: "18px", color: "var(--color-primary)"}}>퀴즈 진행 중</h2>
          <div style={{width: "24px"}}></div>
        </div>

        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${progressPercent}%` }}></div>
        </div>

        <div className="quiz-meta">
          <span>{question.category} • {question.difficulty}</span>
          <span style={{fontWeight: "bold", color: "var(--color-accent)"}}>{currentQIndex + 1} / {quizQuestions.length}</span>
        </div>

        <div className="quiz-question">{question.text}</div>

        <div className="options-list">
          {question.options.map((opt, idx) => {
            let btnClass = "option-btn";
            if (isAnswerChecked) {
              if (idx === question.correctAnswerIndex) {
                btnClass += " correct";
              } else if (idx === selectedOption) {
                btnClass += " wrong";
              }
            } else if (idx === selectedOption) {
              btnClass += " selected";
            }

            return (
              <button 
                key={idx} 
                className={btnClass}
                onClick={() => handleOptionClick(idx)}
                disabled={isAnswerChecked}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {isAnswerChecked && (
          <div className="explanation-box">
            <div className="explanation-title">해설</div>
            <p className="explanation-text">{question.explanation}</p>
          </div>
        )}

        {isAnswerChecked && (
          <div style={{marginTop: "20px"}}>
            <button className="btn-primary" onClick={handleNextQuestion}>
              {currentQIndex < quizQuestions.length - 1 ? "다음 문제" : "결과 확인"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === "QUIZ_RESULT") {
    const accuracy = quizQuestions.length > 0 ? Math.round((sessionCorrectCount / quizQuestions.length) * 100) : 0;

    return (
      <div className="container center animation-fade-in">
        <div className="result-container">
          <div className="result-icon">🎉</div>
          <h1 className="result-title">퀴즈 완료!</h1>
          <p className="result-subtitle">수고하셨습니다. 결과를 확인하세요.</p>

          <div className="score-board">
            <div className="score-row">
              <span>정답 수</span>
          <span style={{fontWeight: "bold"}}>{sessionCorrectCount} / {quizQuestions.length} 개</span>
            </div>
            <div className="score-row">
              <span>정답률</span>
              <span style={{fontWeight: "bold"}}>{accuracy}%</span>
            </div>
            <div className="score-row total">
              <span>획득 점수</span>
              <span className="points">+{sessionScore}점</span>
            </div>
          </div>

          <button className="btn-primary large" onClick={() => setView("HOME")}>
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  if (view === "LEADERBOARD") {
    const medals = ["🥇", "🥈", "🥉"];
    const myUid = userData?.uid || auth.currentUser?.uid;
    const myRank = leaderboard.findIndex(e => e.uid === myUid) + 1;
    const depts = Array.from(new Set(leaderboard.map(e => e.department)));
    return (
      <div className="container animation-fade-in page-with-nav">
        <div className="page-header">
          <h1 className="page-title">🏆 리더보드</h1>
          <div className="realtime-dot" title="실시간 업데이트 중"></div>
        </div>
        {myRank > 0 && (
          <div className="my-rank-banner">
            <div><div className="my-rank-label">내 순위</div><div style={{fontSize:"12px",color:"#555"}}>{userData?.name}</div></div>
            <div className="my-rank-value">{myRank}위</div>
          </div>
        )}
        <div className="tab-bar">
          <button id="lb-tab-all" className={`tab-btn ${lbTab === "전체" ? "active" : ""}`} onClick={() => setLbTab("전체")}>전체 순위</button>
          <button id="lb-tab-dept" className={`tab-btn ${lbTab === "부서별" ? "active" : ""}`} onClick={() => setLbTab("부서별")}>부서별 순위</button>
        </div>
        <div className="leaderboard-list">
          {lbTab === "전체" ? (
            leaderboard.length === 0 ? <div className="empty-state">📭 아직 참여자가 없습니다</div> :
            leaderboard.map((e, i) => (
              <div key={e.uid} className={`leaderboard-item ${e.uid === myUid ? "mine" : ""}`}>
                {i < 3 ? <span className="medal-icon">{medals[i]}</span> : <div className="rank-number">{i+1}</div>}
                <div className="lb-info"><div className="lb-name">{e.name}</div><div className="lb-dept">{e.department}</div></div>
                <div className="lb-score">{e.score}점</div>
              </div>
            ))
          ) : (
            depts.map(dept => {
              const deptList = leaderboard.filter(e => e.department === dept);
              return (
                <div key={dept}>
                  <div className="dept-section-title">{dept}</div>
                  {deptList.map((e, i) => (
                    <div key={e.uid} className={`leaderboard-item ${e.uid === myUid ? "mine" : ""}`} style={{marginBottom:"8px"}}>
                      {i < 3 ? <span className="medal-icon">{medals[i]}</span> : <div className="rank-number">{i+1}</div>}
                      <div className="lb-info"><div className="lb-name">{e.name}</div></div>
                      <div className="lb-score">{e.score}점</div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
        <nav className="bottom-nav">
          <button id="nav-home-lb" className="nav-btn" onClick={() => setView("HOME")}><span className="nav-icon">🏠</span>홈</button>
          <button id="nav-lb-active" className="nav-btn active"><span className="nav-icon">🏆</span>리더보드</button>
          <button id="nav-records-lb" className="nav-btn" onClick={() => { setQuizHistory(userData?.quizHistory || []); setView("MY_RECORDS"); }}><span className="nav-icon">📊</span>내 기록</button>
        </nav>
      </div>
    );
  }

  if (view === "MY_RECORDS") {
    const totalAttempts = userData?.totalAttempts || 0;
    const correctCount = userData?.correctCount || 0;
    const accuracy = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;
    const myUid = userData?.uid || auth.currentUser?.uid;
    const globalRank = leaderboard.findIndex(e => e.uid === myUid) + 1;
    const wrongQuestions = userData?.wrongQuestions || [];
    const history: QuizHistoryItem[] = quizHistory.length > 0 ? quizHistory : (userData?.quizHistory || []);
    return (
      <div className="container animation-fade-in page-with-nav">
        <div className="page-header"><h1 className="page-title">📊 내 기록</h1></div>
        <div className="stats-grid">
          <div className="stat-card wide">
            <div><div className="stat-label">누적 총점</div><div className="stat-value">{userData?.score || 0}점</div></div>
            <div style={{fontSize:"40px"}}>🏅</div>
          </div>
          <div className="stat-card"><div className="stat-icon">🌍</div><div className="stat-label">전체 순위</div><div className="stat-value">{globalRank > 0 ? `${globalRank}위` : "-"}</div></div>
          <div className="stat-card"><div className="stat-icon">📝</div><div className="stat-label">총 참여 횟수</div><div className="stat-value">{Math.floor(totalAttempts / 10)}회</div></div>
          <div className="stat-card"><div className="stat-icon">🎯</div><div className="stat-label">정답률</div><div className="stat-value">{accuracy}%</div></div>
          <div className="stat-card"><div className="stat-icon">❌</div><div className="stat-label">오답 문제 수</div><div className="stat-value">{wrongQuestions.length}개</div></div>
        </div>
        {wrongQuestions.length > 0 && (
          <button className="btn-review" onClick={() => alert("오답 복습 기능은 문제 데이터 연동 후 활성화됩니다.")}>
            📖 오답 복습하기 ({wrongQuestions.length}문제)
          </button>
        )}
        <div className="history-section">
          <div className="section-title">🕐 최근 5회 기록</div>
          {history.length === 0 ? <div className="empty-state" style={{padding:"20px 0"}}>아직 퀴즈 기록이 없습니다</div> :
            history.map((h, i) => (
              <div key={i} className="history-item">
                <span className="history-date">{h.date}</span>
                <span className="history-score">{h.score}점</span>
                <span className="history-accuracy">{h.accuracy}%</span>
              </div>
            ))
          }
        </div>
        <nav className="bottom-nav">
          <button id="nav-home-rec" className="nav-btn" onClick={() => setView("HOME")}><span className="nav-icon">🏠</span>홈</button>
          <button id="nav-lb-rec" className="nav-btn" onClick={() => setView("LEADERBOARD")}><span className="nav-icon">🏆</span>리더보드</button>
          <button id="nav-records-active" className="nav-btn active"><span className="nav-icon">📊</span>내 기록</button>
        </nav>
      </div>
    );
  }

  if (view === "DAILY_QUIZ") {
    const today = getUtcDateKey();
    const handleDailyOption = async (idx: number) => {
      if (dailyAnswerChecked) return;
      setDailySelectedOption(idx);
      setDailyAnswerChecked(true);
      const isCorrect = dailyQuestion ? idx === dailyQuestion.correctAnswerIndex : false;
      setDailyCorrect(isCorrect);
      if (isCorrect) {
        try {
          const user = auth.currentUser;
          if (user) {
            await updateDoc(doc(db, "users", user.uid), { score: increment(15), dailyCompletedDate: today });
            setUserData((prev) =>
              prev ? { ...prev, score: (prev.score || 0) + 15, dailyCompletedDate: today } : prev
            );
          }
        } catch (e) { console.error(e); }
      }
    };
    return (
      <div className="container animation-fade-in" style={{backgroundColor:"white"}}>
        <div className="quiz-header">
          <button className="close-btn" onClick={() => setView("HOME")}>✕</button>
          <h2 style={{margin:0,fontSize:"18px",color:"var(--color-primary)"}}>일일 말씀 퀴즈</h2>
          <div style={{width:"24px"}}></div>
        </div>
        {dailyCompleted ? (
          <div className="daily-done-card">
            <div className="daily-done-icon">✅</div>
            <div className="daily-done-title">오늘의 퀴즈 완료!</div>
            <div className="daily-done-subtitle">내일 다시 도전하세요.<br/>매일 새로운 말씀 문제가 기다립니다. 🙏</div>
            <button className="btn-secondary" style={{marginTop:"20px"}} onClick={() => setView("HOME")}>홈으로</button>
          </div>
        ) : dailyQuestion ? (
          <div style={{marginTop:"10px"}}>
            <div className="daily-card">
              <div className="daily-badge">📖 오늘의 말씀 퀴즈 · +15점</div>
              <div className="daily-verse">{dailyQuestion.text}</div>
              <div className="daily-points">정답 시 15점 획득!</div>
            </div>
            <div className="options-list">
              {dailyQuestion.options.map((opt, idx) => {
                let cls = "option-btn";
                if (dailyAnswerChecked) {
                  if (idx === dailyQuestion.correctAnswerIndex) cls += " correct";
                  else if (idx === dailySelectedOption) cls += " wrong";
                } else if (idx === dailySelectedOption) cls += " selected";
                return <button key={idx} className={cls} onClick={() => handleDailyOption(idx)} disabled={dailyAnswerChecked}>{opt}</button>;
              })}
            </div>
            {dailyAnswerChecked && (
              <div className="explanation-box" style={{marginTop:"20px"}}>
                <div className="explanation-title">{dailyCorrect ? "🎉 정답! +15점 획득!" : "😢 오답"}</div>
                <p className="explanation-text">{dailyQuestion.explanation}</p>
              </div>
            )}
            {dailyAnswerChecked && (
              <button className="btn-primary" style={{marginTop:"16px"}} onClick={() => setView("HOME")}>홈으로 돌아가기</button>
            )}
          </div>
        ) : (
          <div className="empty-state">문제를 불러오는 중...</div>
        )}
      </div>
    );
  }

  if (view === "ADMIN") {
    const deptStats = participants.reduce((acc: Record<string, { count: number; totalScore: number }>, p) => {
      const d = p.department || "미분류";
      if (!acc[d]) acc[d] = { count: 0, totalScore: 0 };
      acc[d].count++;
      acc[d].totalScore += p.score || 0;
      return acc;
    }, {});
    return (
      <div className="container animation-fade-in" style={{backgroundColor:"#f4f6f8"}}>
        <div className="quiz-header">
          <button className="close-btn" onClick={() => setView("HOME")}>✕</button>
          <h2 style={{margin:0,fontSize:"18px",color:"var(--color-primary)"}}>🔒 관리자</h2>
          <div style={{width:"24px"}}></div>
        </div>
        <div className="tab-bar" style={{marginTop:"8px"}}>
          <button id="admin-tab-q" className={`tab-btn ${adminTab==="questions"?"active":""}`} onClick={()=>setAdminTab("questions")} style={{fontSize:"12px"}}>📝문제</button>
          <button id="admin-tab-c" className={`tab-btn ${adminTab==="contest"?"active":""}`} onClick={()=>setAdminTab("contest")} style={{fontSize:"12px"}}>📅대회</button>
          <button id="admin-tab-p" className={`tab-btn ${adminTab==="participants"?"active":""}`} onClick={async()=>{const ps=await getDocs(collection(db,"users"));setParticipants(ps.docs.map(d=>d.data() as UserDoc));setAdminTab("participants");}} style={{fontSize:"12px"}}>👥현황</button>
          <button id="admin-tab-r" className={`tab-btn ${adminTab==="reset"?"active":""}`} onClick={()=>setAdminTab("reset")} style={{fontSize:"12px",color:adminTab==="reset"?undefined:"#e44"}}>⚠️초기화</button>
        </div>

        {adminTab === "questions" && (
          <div>
            <div className="history-section">
              <div className="section-title">📊 등록된 문제 ({adminQuestions.length}개)</div>
              {adminQuestions.length === 0 ? <div className="empty-state" style={{padding:"16px 0"}}>등록된 문제가 없습니다</div> :
                adminQuestions.map((q,i) => (
                  <div key={q.id} style={{padding:"10px 0",borderBottom:"1px solid #f0f0f0",display:"flex",alignItems:"flex-start",gap:"8px"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:"13px",fontWeight:"bold",color:"var(--color-primary)",marginBottom:"2px"}}>{i+1}. {q.text?.slice(0,40)}{q.text?.length>40?"...":""}</div>
                      <div style={{fontSize:"11px",color:"#888"}}>{q.category} · {q.difficulty} · {q.is_daily?"일일":"일반"}</div>
                    </div>
                    <div style={{display:"flex",gap:"4px",flexShrink:0}}>
                      <button style={{fontSize:"11px",padding:"4px 8px",border:"1px solid #ddd",borderRadius:"6px",background:q.active===false?"#fee":"#e8f5e9",cursor:"pointer"}} onClick={async()=>{await updateDoc(doc(db,"questions",q.id),{active:q.active===false?true:false});const s=await getDocs(collection(db,"questions"));setAdminQuestions(s.docs.map(d=>({id: d.id, ...(d.data() as Omit<QuestionDoc, "id">)})));}}>{q.active===false?"🚫비활성":"✅활성"}</button>
                    </div>
                  </div>
                ))
              }
            </div>
            <div className="history-section">
              <div className="section-title">➕ 새 문제 추가 (JSON)</div>
              <textarea id="admin-json-input" value={newQJson} onChange={e=>{setNewQJson(e.target.value);setJsonError("");}} placeholder={`{
  "text": "질문 내용",
  "category": "구약",
  "difficulty": "보통",
  "options": ["A","B","C","D"],
  "correctAnswerIndex": 0,
  "explanation": "해설",
  "points": 20,
  "is_daily": false,
  "active": true
}`} style={{width:"100%",minHeight:"160px",fontFamily:"monospace",fontSize:"12px",border:"1px solid #ddd",borderRadius:"8px",padding:"10px",resize:"vertical",outline:"none"}} />
              {jsonError && <p style={{color:"red",fontSize:"12px",margin:"4px 0"}}>{jsonError}</p>}
              <button className="btn-primary" style={{marginTop:"8px"}} onClick={async()=>{ try { const q=JSON.parse(newQJson); if(!q.text||!q.options||q.correctAnswerIndex===undefined) throw new Error("필수 필드 누락"); await addDoc(collection(db,"questions"),{...q,createdAt:serverTimestamp()}); setNewQJson(""); setJsonError(""); const s=await getDocs(collection(db,"questions")); setAdminQuestions(s.docs.map(d=>({id: d.id, ...(d.data() as Omit<QuestionDoc, "id">)}))); } catch(e){setJsonError(e instanceof Error ? e.message : "알 수 없는 오류");} }}>하트에 등록</button>
            </div>
          </div>
        )}

        {adminTab === "contest" && (
          <div className="history-section">
            <div className="section-title">📅 대회 기간 설정</div>
            <div className="form" style={{gap:"12px"}}>
              <div className="form-group">
                <label style={{fontSize:"13px"}}>시작일</label>
                <input id="contest-start" type="date" value={contestStart} onChange={e=>setContestStart(e.target.value)} className="input" />
              </div>
              <div className="form-group">
                <label style={{fontSize:"13px"}}>종료일</label>
                <input id="contest-end" type="date" value={contestEnd} onChange={e=>setContestEnd(e.target.value)} className="input" />
              </div>
              {contestStart && contestEnd && (
                <div style={{background:"#e8f5e9",borderRadius:"8px",padding:"12px",fontSize:"14px",color:"#2e7d32"}}>
                  📅 {contestStart} ~ {contestEnd}
                </div>
              )}
              <button className="btn-primary" style={{marginTop:"4px"}} onClick={async()=>{ await setDoc(doc(db,"admin_config","settings"),{contestStart,contestEnd},{merge:true}); setContestSaved(true); setTimeout(()=>setContestSaved(false),2000); }}>{contestSaved?"✅ 저장됨!":"저장"}</button>
            </div>
          </div>
        )}

        {adminTab === "participants" && (
          <div>
            <div className="stats-grid" style={{marginBottom:"16px"}}>
              {Object.entries(deptStats).map(([dept,stat])=>(
                <div key={dept} className="stat-card">
                  <div className="stat-icon">👥</div>
                  <div className="stat-label">{dept}</div>
                  <div className="stat-value" style={{fontSize:"18px"}}>{stat.count}명</div>
                  <div style={{fontSize:"12px",color:"#888"}}>평균 {stat.count>0?Math.round(stat.totalScore/stat.count):0}점</div>
                </div>
              ))}
            </div>
            <div className="history-section">
              <div className="section-title">👤 전체 참여자 ({participants.length}명)</div>
              {sortedParticipants.map((p,i)=>(
                <div key={p.uid||i} className="history-item">
                  <span style={{fontSize:"13px"}}><strong>{p.name}</strong> <span style={{color:"#aaa",fontSize:"11px"}}>({p.department})</span></span>
                  <span className="history-score">{p.score||0}점</span>
                  <span className="history-accuracy">{p.totalAttempts>0?Math.round((p.correctCount/p.totalAttempts)*100):0}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {adminTab === "reset" && (
          <div className="history-section">
            <div className="section-title" style={{color:"#c62828"}}>⚠️ 위험 구역</div>
            <p style={{fontSize:"14px",color:"#888",lineHeight:1.6}}>아래 버튼을 누르면 <strong>모든 참여자의 점수가 0으로 초기화</strong>됩니다. 이 작업은 되돌릴 수 없습니다.</p>
            <button id="admin-reset-btn" className="btn-primary" style={{background:"#c62828",marginTop:"8px"}} onClick={async()=>{
              if(!window.confirm("정말로 전체 점수를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) return;
              if(!window.confirm("마지막 확인입니다. 초기화를 진행합니까?")) return;
              try {
                const snap = await getDocs(collection(db,"users"));
                const batch = writeBatch(db);
                snap.docs.forEach(d=>batch.update(d.ref,{score:0,totalAttempts:0,correctCount:0,wrongQuestions:[],quizHistory:[],dailyCompletedDate:""}));
                await batch.commit();
                setParticipants(prev=>prev.map(p=>({...p,score:0,totalAttempts:0,correctCount:0})));
                alert("✅ 초기화 완료!");
              } catch(e){alert("오류: "+(e instanceof Error ? e.message : "알 수 없는 오류"));}
            }}>🗑️ 전체 점수 초기화</button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
