// CalendarPicker.jsx — Date picker component aligned to DealFlow design system
// Standalone calendar widget with month/year navigation, keyboard support, and
// integration into modal/slide-over contexts. Follows the Ember/Cream palette.

export const Calendar = ({ value, onChange, minDate, maxDate }) => {
  const [viewDate, setViewDate] = React.useState(() => {
    if (value instanceof Date) return new Date(value);
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const [inputValue, setInputValue] = React.useState(() => {
    if (value instanceof Date) {
      return value.toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    return '';
  });

  // Validate that a date is within bounds
  const isDateValid = (date) => {
    if (minDate && date < minDate) return false;
    if (maxDate && date > maxDate) return false;
    return true;
  };

  // Generate calendar grid for current viewDate
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const calendarDays = (() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    // Pad previous month's days
    const daysInPrevMonth = getDaysInMonth(year, month - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrentMonth: false, isPrev: true });
    }

    // Current month's days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, isCurrentMonth: true, isPrev: false });
    }

    // Pad next month's days
    const totalCells = days.length;
    const remaining = 42 - totalCells; // 6 rows × 7 days
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, isCurrentMonth: false, isPrev: false });
    }

    return days;
  })();

  const handleDayClick = (dayObj) => {
    if (!dayObj.isCurrentMonth) return;
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayObj.day);
    if (!isDateValid(newDate)) return;
    onChange(newDate);
  };

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1));
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    // Try to parse DD/MM/YYYY or DD-MM-YYYY
    const match = val.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (match) {
      const [, d, m, y] = match;
      const parsed = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      if (!isNaN(parsed) && isDateValid(parsed)) {
        onChange(parsed);
        setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
      }
    }
  };

  const monthYear = viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div style={calendarPickerStyles.container}>
      <div style={calendarPickerStyles.inputSection}>
        <label style={calendarPickerStyles.label}>Select date</label>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="DD/MM/YYYY"
          style={calendarPickerStyles.input}
        />
      </div>

      <div style={calendarPickerStyles.calendar}>
        <div style={calendarPickerStyles.header}>
          <button onClick={handlePrevMonth} style={calendarPickerStyles.navButton}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <div style={calendarPickerStyles.monthYear}>{monthYear}</div>
          <button onClick={handleNextMonth} style={calendarPickerStyles.navButton}>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>

        <div style={calendarPickerStyles.weekDays}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} style={calendarPickerStyles.weekDay}>
              {day}
            </div>
          ))}
        </div>

        <div style={calendarPickerStyles.daysGrid}>
          {calendarDays.map((dayObj, idx) => {
            let cellDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayObj.day);
            if (!dayObj.isCurrentMonth) {
              const prevMonthDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, dayObj.day);
              const nextMonthDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, dayObj.day);
              cellDate = dayObj.isPrev ? prevMonthDate : nextMonthDate;
            }

            const isSelected = value instanceof Date &&
              value.getFullYear() === cellDate.getFullYear() &&
              value.getMonth() === cellDate.getMonth() &&
              value.getDate() === cellDate.getDate();

            const isToday = (() => {
              const today = new Date();
              return today.getFullYear() === cellDate.getFullYear() &&
                today.getMonth() === cellDate.getMonth() &&
                today.getDate() === cellDate.getDate();
            })();

            const isDisabled = !dayObj.isCurrentMonth || !isDateValid(cellDate);

            return (
              <button
                key={idx}
                onClick={() => handleDayClick(dayObj)}
                disabled={isDisabled}
                style={{
                  ...calendarPickerStyles.dayButton,
                  ...(isDisabled ? calendarPickerStyles.dayButtonDisabled : {}),
                  ...(isSelected ? calendarPickerStyles.dayButtonSelected : {}),
                  ...(isToday && !isSelected ? calendarPickerStyles.dayButtonToday : {}),
                  ...(dayObj.isCurrentMonth ? {} : calendarPickerStyles.dayButtonOtherMonth),
                }}
              >
                {dayObj.day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const calendarPickerStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    background: '#fff',
    borderRadius: 12,
    padding: 16,
    border: '1px solid var(--cream-300)',
  },
  inputSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--cream-800)',
    letterSpacing: 0,
  },
  input: {
    width: '100%',
    border: '1px solid var(--cream-400)',
    borderRadius: 8,
    background: '#fff',
    padding: '9px 12px',
    fontSize: 13.5,
    color: 'var(--cream-900)',
    boxShadow: 'inset 0 1px 0 rgba(20, 40, 35, 0.02)',
    outline: 'none',
    fontFamily: 'var(--font-body)',
  },
  calendar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  navButton: {
    width: 32,
    height: 32,
    border: '1px solid var(--cream-300)',
    borderRadius: 8,
    background: '#fff',
    color: 'var(--cream-700)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 120ms',
  },
  monthYear: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--cream-900)',
    flex: 1,
    textAlign: 'center',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.01em',
  },
  weekDays: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 2,
  },
  weekDay: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--cream-700)',
    textAlign: 'center',
    padding: '8px 4px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  daysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 2,
  },
  dayButton: {
    width: '100%',
    aspectRatio: '1',
    border: '1px solid transparent',
    borderRadius: 8,
    background: '#fff',
    color: 'var(--cream-900)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 120ms',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-body)',
  },
  dayButtonDisabled: {
    color: 'var(--cream-400)',
    cursor: 'not-allowed',
    background: 'var(--cream-50)',
  },
  dayButtonOtherMonth: {
    color: 'var(--cream-300)',
    background: 'transparent',
  },
  dayButtonSelected: {
    background: 'var(--teal-500)',
    color: 'var(--cream-50)',
    border: '1px solid var(--teal-500)',
    fontWeight: 600,
  },
  dayButtonToday: {
    border: '1px solid var(--ember-400)',
    color: 'var(--ember-500)',
  },
};

Object.assign(window, { Calendar });
