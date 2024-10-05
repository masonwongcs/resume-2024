function calculateYearDifference(date: string) {
  const startDate = new Date(date);
  const endDate = new Date();

  let yearsDiff = endDate.getFullYear() - startDate.getFullYear();

  // Check if the current year's date hasn't been reached yet
  const startMonth = startDate.getMonth();
  const endMonth = endDate.getMonth();

  if (endMonth < startMonth || (endMonth === startMonth && endDate.getDate() < startDate.getDate())) {
    yearsDiff--;
  }

  return yearsDiff;
}

export { calculateYearDifference };
