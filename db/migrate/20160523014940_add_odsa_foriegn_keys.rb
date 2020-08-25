class AddOdsaForiegnKeys < ActiveRecord::Migration[5.1]
  def change
    add_foreign_key "inst_book_section_exercises", "inst_exercises"
    add_foreign_key "inst_book_section_exercises", "inst_books"
    add_foreign_key "inst_book_section_exercises", "inst_sections"
    add_foreign_key "inst_books", "course_offerings"
    add_foreign_key "inst_books", "users"
    add_foreign_key "inst_chapter_modules", "inst_chapters"
    add_foreign_key "inst_chapter_modules", "inst_modules"
    add_foreign_key "inst_chapters", "inst_books"
    add_foreign_key "inst_sections", "inst_chapter_modules"
    add_foreign_key "inst_sections", "inst_modules"
    add_foreign_key "odsa_book_progresses", "inst_books"
    add_foreign_key "odsa_book_progresses", "users"
    add_foreign_key "odsa_exercise_attempts", "inst_book_section_exercises"
    add_foreign_key "odsa_exercise_attempts", "users"
    add_foreign_key "odsa_exercise_attempts", "inst_books"
    add_foreign_key "odsa_exercise_attempts", "inst_sections"
    add_foreign_key "odsa_exercise_progresses", "inst_book_section_exercises"
    add_foreign_key "odsa_exercise_progresses", "users"
    add_foreign_key "odsa_module_progresses", "inst_books"
    add_foreign_key "odsa_module_progresses", "inst_modules"
    add_foreign_key "odsa_module_progresses", "users"
    add_foreign_key "odsa_student_extensions", "inst_sections"
    add_foreign_key "odsa_student_extensions", "users"
    add_foreign_key "odsa_user_interactions", "users"
    add_foreign_key "odsa_user_interactions", "inst_books"
    add_foreign_key "odsa_user_interactions", "inst_sections"
    add_foreign_key "odsa_user_interactions", "inst_book_section_exercises"
  end
end
