"use client";

import { useEffect, useState } from "react";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

type ViewState = "SPLASH" | "REGISTER" | "HOME" | "QUIZ_SETUP" | "QUIZ_PLAY" | "QUIZ_RESULT";
type Category = "구약" | "신약" | "전체";
type Difficulty = "쉬움" | "보통" | "어려움";

type Question = {
  id: number;
  category: "구약" | "신약";
  difficulty: Difficulty;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  points: number;
};

// 1. Mock Data Generator
const generateMockQuestions = (selectedCategory: Category, selectedDifficulty: Difficulty): Question[] => {
  const points = selectedDifficulty === "쉬움" ? 10 : selectedDifficulty === "보통" ? 20 : 30;
  
  return Array(10).fill(0).map((_, i) => {
    const actualCategory = selectedCategory === "전체" 
      ? (i % 2 === 0 ? "구약" : "신약") 
      : selectedCategory;
      
    return {
      id: i,
      category: actualCategory,
      difficulty: selectedDifficulty,
      text: `[${selectedDifficulty}] ${actualCategory} 관련 모의 퀴즈 문제 ${i + 1}번입니다. 정답은 항상 첫 번째 항목입니다.`,
      options: ["정답 항목", "오답 항목 A", "오답 항목 B", "오답 항목 C"],
      correctAnswerIndex: 0,
      explanation: `이것은 ${selectedDifficulty} 난이도의 ${actualCategory} 문제에 대한 해설입니다. 정답을 맞추어 ${points}점을 획득했습니다.`,
      points: points,
    };
  });
};

export default function App() {
  const [view, setView] = useState<ViewState>("SPLASH");
  const [userData, setUserData] = useState<any>(null);

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

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          try {
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              setUserData(userDoc.data());
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
      return () => unsubscribe();
    }, 2000);
    return () => clearTimeout(splashTimer);
  }, []);

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

  const startQuizPlay = () => {
    const questions = generateMockQuestions(setupCategory, setupDifficulty);
    setQuizQuestions(questions);
    setCurrentQIndex(0);
    setSelectedOption(null);
    setIsAnswerChecked(false);
    setSessionScore(0);
    setSessionCorrectCount(0);
    setView("QUIZ_PLAY");
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
        await updateDoc(userDocRef, {
          score: increment(sessionScore),
          totalAttempts: increment(10),
          correctCount: increment(sessionCorrectCount)
        });
        
        setUserData((prev: any) => ({
          ...prev,
          score: (prev?.score || 0) + sessionScore,
          totalAttempts: (prev?.totalAttempts || 0) + 10,
          correctCount: (prev?.correctCount || 0) + sessionCorrectCount
        }));
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
    return (
      <div className="container animation-fade-in">
        <h1 className="app-name small" style={{textAlign: "left", marginTop: "10px"}}>성경퀴즈</h1>
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
          <button className="btn-secondary" onClick={() => alert("일일 말씀 퀴즈 화면은 개발 예정입니다.")}>일일 말씀 퀴즈</button>
        </div>
        <div className="ranking-preview">
          <h3 className="ranking-title">🏆 TOP 3 명예의 전당</h3>
          <ul className="ranking-list">
            <li className="ranking-item"><span className="rank">1</span><span className="rank-name">김다윗 (장년부)</span><span className="rank-score">1500점</span></li>
            <li className="ranking-item"><span className="rank">2</span><span className="rank-name">이요셉 (청년부)</span><span className="rank-score">1420점</span></li>
            <li className="ranking-item"><span className="rank">3</span><span className="rank-name">박사무엘 (중고등부)</span><span className="rank-score">1350점</span></li>
          </ul>
        </div>
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

    const progressPercent = ((currentQIndex) / 10) * 100;

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
          <span style={{fontWeight: "bold", color: "var(--color-accent)"}}>{currentQIndex + 1} / 10</span>
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
              {currentQIndex < 9 ? "다음 문제" : "결과 확인"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === "QUIZ_RESULT") {
    const accuracy = Math.round((sessionCorrectCount / 10) * 100);

    return (
      <div className="container center animation-fade-in">
        <div className="result-container">
          <div className="result-icon">🎉</div>
          <h1 className="result-title">퀴즈 완료!</h1>
          <p className="result-subtitle">수고하셨습니다. 결과를 확인하세요.</p>

          <div className="score-board">
            <div className="score-row">
              <span>정답 수</span>
              <span style={{fontWeight: "bold"}}>{sessionCorrectCount} / 10 개</span>
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

  return null;
}
