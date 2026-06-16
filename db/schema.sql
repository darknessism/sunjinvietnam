-- SUNJIN Vietnam — MySQL Schema
-- Run this once to set up all tables.
-- Railway: connect to your MySQL service and run this file.

CREATE DATABASE IF NOT EXISTS sunjin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sunjin;

-- ─── Projects ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
    id          VARCHAR(120) PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    category    VARCHAR(60),
    location    VARCHAR(255),
    year        INT,
    award       TEXT,
    architects  TEXT,
    cover_image TEXT,
    status      ENUM('published','draft') DEFAULT 'draft',
    cols        INT DEFAULT 12,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_details (
    project_id   VARCHAR(120) PRIMARY KEY,
    title_plain  VARCHAR(255),
    title_display VARCHAR(255),
    category_label VARCHAR(120),
    year_loc     VARCHAR(120),
    award        TEXT,
    images       JSON,
    lead         TEXT,
    photo1_alt   VARCHAR(255),
    photo1_cap   TEXT,
    photo2_alt   VARCHAR(255),
    photo2_cap   TEXT,
    photo3_alt   VARCHAR(255),
    photo3_cap   TEXT,
    narrative1   JSON,
    narrative2   JSON,
    highlights   JSON,
    specs        JSON,
    credits      JSON,
    awards_list  JSON,
    next_id      VARCHAR(120),
    next_title   VARCHAR(255),
    next_type    VARCHAR(120),
    next_img     TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ─── Blog ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS blog_posts (
    id          VARCHAR(120) PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    category    VARCHAR(60),
    author      VARCHAR(255),
    post_date   DATE,
    read_time   INT DEFAULT 5,
    excerpt     TEXT,
    cover_image TEXT,
    status      ENUM('published','draft') DEFAULT 'draft',
    cols        INT DEFAULT 12,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blog_content (
    post_id           VARCHAR(120) PRIMARY KEY,
    lead              TEXT,
    body              JSON,
    pull_quote        TEXT,
    pull_quote_cite   VARCHAR(255),
    figure_image      TEXT,
    figure_caption    TEXT,
    body_after_figure JSON,
    tags              VARCHAR(500),
    related_posts     JSON,
    FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE
);

-- ─── Careers ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS careers (
    id          VARCHAR(120) PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    department  VARCHAR(60),
    location    VARCHAR(60),
    level       VARCHAR(60),
    type        VARCHAR(60),
    salary      VARCHAR(120),
    deadline    DATE,
    cover_image TEXT,
    description TEXT,
    requirements TEXT,
    benefits    JSON,
    status      ENUM('published','draft') DEFAULT 'draft',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Filter options for the careers section (Department / Location / Level).
-- Managed from the admin panel; drives the filter chips and form dropdowns.
CREATE TABLE IF NOT EXISTS career_taxonomies (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    kind       ENUM('department','location','level') NOT NULL,
    value      VARCHAR(60)  NOT NULL,
    label      VARCHAR(120) NOT NULL,
    sort       INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_kind_value (kind, value)
);
